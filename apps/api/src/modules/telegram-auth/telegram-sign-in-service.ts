import { randomUUID } from 'node:crypto';

import type { CreatedSession, FixedWindowRateLimiter, SessionService } from '@/modules/auth';
import type { HouseholdResolver } from '@/modules/household';
import type {
	TelegramBotClient,
	TelegramCallbackQuery,
	TelegramConfig,
	TelegramMessage,
	TelegramMessages,
	TelegramUpdate,
	TelegramUpdateHandler
} from '@/modules/telegram';

import {
	devTelegramConfirmInputSchema,
	telegramSignInCodeInputSchema,
	type TelegramSignInErrorCode
} from '@i-finances/contracts';

import { describeSignInDevice, describeSignInMoment } from './describe-sign-in-request';
import type { TelegramAccountRepository } from './telegram-account-repository';
import {
	buildSignInCallbackData,
	isSignInCode,
	parseLinkCallbackData,
	parseSignInCallbackData,
	parseStartCommand
} from './telegram-bot-commands';
import { type TelegramIdentity, toTelegramIdentity } from './telegram-identity';
import type { TelegramLinkService } from './telegram-link-service';
import type { TelegramLoginRequest, TelegramLoginRequestRepository } from './telegram-login-request-repository';
import {
	generateTelegramLoginCode,
	generateTelegramLoginSecret,
	hashTelegramLoginSecret,
	telegramLoginSecretMatches
} from './telegram-login-secret';

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAX_IP_ADDRESS_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 512;
/** The family lives in Belarus (BYN only, Р4); the bot names the time of the request in its local time. */
const DEFAULT_TIME_ZONE = 'Europe/Minsk';
/** Requests whose address is unknown share one bucket: no address must never mean «no limit». */
const UNKNOWN_ADDRESS_KEY = 'unknown';

export type TelegramSignInMetadata = {
	ipAddress?: string;
	userAgent?: string;
};

export type TelegramSignInStartOutcome =
	| {
		appUrl: string;
		botUrl: string;
		code: string;
		expiresAt: Date;
		ok: true;
		/** Goes into the httpOnly cookie and nowhere else. */
		secret: string;
		/** Lifetime of the request, and so of its cookie. */
		ttlMilliseconds: number;
	}
	| { errorCode: Extract<TelegramSignInErrorCode, 'rate-limited' | 'telegram-unavailable'>; ok: false; retryAfterSeconds?: number };

export type TelegramSignInCompleteOutcome =
	| { kind: 'pending' }
	| { hasHousehold: boolean; isNewUser: boolean; kind: 'confirmed'; session: CreatedSession }
	| {
		/** The request is over for this browser (expired, rejected, used, refused): its cookie can go. */
		endsRequest: boolean;
		errorCode: TelegramSignInErrorCode;
		kind: 'failed';
		retryAfterSeconds?: number;
	};

export type TelegramSignInSimpleOutcome =
	| { ok: true }
	| { errorCode: TelegramSignInErrorCode; ok: false; retryAfterSeconds?: number };

export type TelegramSignInServiceDependencies = {
	accounts: Pick<TelegramAccountRepository, 'findByTelegramId' | 'signIn'>;
	/** Undefined while no bot token is configured; the bot side then stays silent. */
	botClient: TelegramBotClient | undefined;
	/** Shared by `complete` and `cancel` (the polling routes): 300 per 5 minutes per address (Р11). */
	completeRateLimiter: Pick<FixedWindowRateLimiter, 'tryConsume'>;
	config: Pick<
		TelegramConfig,
		'botUsername' | 'devLoginEnabled' | 'loginTtlMilliseconds' | 'registrationEnabled' | 'signInAvailable'
	>;
	createCode?: () => string;
	createId?: () => string;
	createSecret?: () => string;
	households: Pick<HouseholdResolver, 'findForUser'>;
	/** The bot side of link requests (A4): the bot is one, so `/start` and the buttons of a link request go there. */
	link: Pick<TelegramLinkService, 'confirmFromBot' | 'offer' | 'rejectFromBot'>;
	messages: TelegramMessages;
	now?: () => Date;
	requests: Pick<
		TelegramLoginRequestRepository,
		'cancel' | 'confirm' | 'consume' | 'deleteCreatedBefore' | 'findByCode' | 'findById' | 'insert' | 'reject'
	>;
	sessionService: Pick<SessionService, 'createSession'>;
	/** 10 per 5 minutes per address (Р11). */
	startRateLimiter: Pick<FixedWindowRateLimiter, 'tryConsume'>;
	timeZone?: string;
};

function failed(errorCode: TelegramSignInErrorCode, endsRequest: boolean, retryAfterSeconds?: number): TelegramSignInCompleteOutcome {
	return { endsRequest, errorCode, kind: 'failed', retryAfterSeconds };
}

function addressKey(metadata: TelegramSignInMetadata): string {
	return metadata.ipAddress ?? UNKNOWN_ADDRESS_KEY;
}

/**
 * Sign-in and sign-up through the bot by deep link (Р1, Р4, Р9, Р11; flow 5.1 of
 * `development/decisions/telegram-auth-and-households-v1.md`).
 *
 * 1. `start` (browser): a request with a public `code` for the bot link and a `secret` for the browser's httpOnly
 *    cookie; only the secret's hash is stored.
 * 2. `/start <code>` (bot): the bot does **not** confirm. It shows the device and time of the request with «Войти» and
 *    «Это не я», so a person who was sent someone else's link sees that it is not their sign-in (phishing, Р11).
 * 3. «Войти» (`callback_query`): `pending → confirmed` with the identity from `callback_query.from`. «Это не я»:
 *    `pending → rejected`.
 * 4. `complete` (browser, polling): only the browser with the secret, only once, only while alive (`confirmed → used`).
 *    A known Telegram account signs in; an unknown one becomes a new user when registration is enabled.
 *
 * Every transition is a conditional update that must change exactly one row (see `TelegramLoginRequestRepository`), so
 * races, redelivered updates and repeats after a restart cannot change an outcome. Implements the bot's update port.
 */
export class TelegramSignInService implements TelegramUpdateHandler {
	private readonly createCode: () => string;
	private readonly createId: () => string;
	private readonly createSecret: () => string;
	private readonly now: () => Date;
	private readonly timeZone: string;

	public constructor(private readonly dependencies: TelegramSignInServiceDependencies) {
		this.createCode = dependencies.createCode ?? generateTelegramLoginCode;
		this.createId = dependencies.createId ?? randomUUID;
		this.createSecret = dependencies.createSecret ?? generateTelegramLoginSecret;
		this.now = dependencies.now ?? (() => new Date());
		this.timeZone = dependencies.timeZone ?? DEFAULT_TIME_ZONE;
	}

	public async start(metadata: TelegramSignInMetadata): Promise<TelegramSignInStartOutcome> {
		const { botUsername, loginTtlMilliseconds, signInAvailable } = this.dependencies.config;

		if (!signInAvailable || botUsername === undefined) {
			return { errorCode: 'telegram-unavailable', ok: false };
		}

		const now = this.now();
		const limit = this.dependencies.startRateLimiter.tryConsume(addressKey(metadata), now.getTime());

		if (!limit.allowed) {
			return { errorCode: 'rate-limited', ok: false, retryAfterSeconds: limit.retryAfterSeconds };
		}

		await this.dependencies.requests.deleteCreatedBefore(new Date(now.getTime() - DAY_MILLISECONDS));

		const code = this.createCode();
		const secret = this.createSecret();
		const expiresAt = new Date(now.getTime() + loginTtlMilliseconds);

		await this.dependencies.requests.insert({
			code,
			createdAt: now,
			expiresAt,
			id: this.createId(),
			ipAddress: metadata.ipAddress?.slice(0, MAX_IP_ADDRESS_LENGTH),
			purpose: 'sign-in',
			secretHash: hashTelegramLoginSecret(secret),
			userAgent: metadata.userAgent?.slice(0, MAX_USER_AGENT_LENGTH)
		});

		return {
			appUrl: `tg://resolve?domain=${botUsername}&start=${code}`,
			botUrl: `https://t.me/${botUsername}?start=${code}`,
			code,
			expiresAt,
			ok: true,
			secret,
			ttlMilliseconds: loginTtlMilliseconds
		};
	}

	/**
	 * The polling step of the starting browser. Before the secret matches, every answer is the same
	 * `browser-mismatch`: unknown, foreign, expired and used codes are indistinguishable to anyone else.
	 */
	public async complete(
		input: unknown,
		secret: string | undefined,
		metadata: TelegramSignInMetadata
	): Promise<TelegramSignInCompleteOutcome> {
		const now = this.now();
		const limit = this.dependencies.completeRateLimiter.tryConsume(addressKey(metadata), now.getTime());

		if (!limit.allowed) {
			return failed('rate-limited', false, limit.retryAfterSeconds);
		}

		const parsedInput = telegramSignInCodeInputSchema.safeParse(input);

		if (!parsedInput.success) {
			return failed('invalid-input', false);
		}

		const request = await this.dependencies.requests.findByCode(parsedInput.data.code);

		if (request === undefined || request.purpose !== 'sign-in' || !telegramLoginSecretMatches(request.secretHash, secret)) {
			return failed('browser-mismatch', false);
		}

		if (request.status === 'pending') {
			return request.expiresAt > now ? { kind: 'pending' } : failed('login-expired', true);
		}

		if (request.status !== 'confirmed') {
			return failed(request.status === 'rejected' ? 'login-rejected' : 'login-expired', true);
		}

		// The transition decides, not the row read above: a parallel poll may have taken it meanwhile, or it expired.
		const consumed = await this.dependencies.requests.consume({
			id: request.id,
			now,
			secretHash: hashTelegramLoginSecret(secret ?? '')
		});

		if (!consumed || request.identity === null) {
			return this.settledFailure(request.id);
		}

		const resolution = await this.dependencies.accounts.signIn({
			allowRegistration: this.dependencies.config.registrationEnabled,
			identity: request.identity,
			newUserId: this.createId(),
			now
		});

		if (resolution.kind === 'not-found') {
			return failed('registration-closed', true);
		}

		if (resolution.kind === 'existing' && !resolution.isActive) {
			return failed('account-disabled', true);
		}

		const session = await this.dependencies.sessionService.createSession(resolution.userId, metadata);
		const household = await this.dependencies.households.findForUser(resolution.userId);

		return {
			hasHousehold: household !== undefined,
			isNewUser: resolution.kind === 'registered',
			kind: 'confirmed',
			session
		};
	}

	/** The starting browser gives up. Answers the same whether or not anything was cancelled. */
	public async cancel(
		input: unknown,
		secret: string | undefined,
		metadata: TelegramSignInMetadata
	): Promise<TelegramSignInSimpleOutcome> {
		const limit = this.dependencies.completeRateLimiter.tryConsume(addressKey(metadata), this.now().getTime());

		if (!limit.allowed) {
			return { errorCode: 'rate-limited', ok: false, retryAfterSeconds: limit.retryAfterSeconds };
		}

		const parsedInput = telegramSignInCodeInputSchema.safeParse(input);

		if (!parsedInput.success) {
			return { errorCode: 'invalid-input', ok: false };
		}

		const request = await this.dependencies.requests.findByCode(parsedInput.data.code);

		if (request !== undefined && telegramLoginSecretMatches(request.secretHash, secret)) {
			await this.dependencies.requests.cancel({ id: request.id, secretHash: hashTelegramLoginSecret(secret ?? '') });
		}

		return { ok: true };
	}

	/**
	 * `DEV_TELEGRAM_LOGIN`: confirms a request as the bot would after «Войти» (or «Привязать» for a link request), for
	 * the given identity. It takes any Telegram id on purpose, so it is a key to every account: the route exists only
	 * when the flag is on, the configuration refuses the flag in production, the controller answers only to this machine
	 * (loopback), and this check is the last line. Never switch the flag on over a copy of the production database.
	 */
	public async devConfirm(input: unknown): Promise<TelegramSignInSimpleOutcome> {
		if (!this.dependencies.config.devLoginEnabled) {
			throw new Error('The dev Telegram confirmation is disabled.');
		}

		const parsedInput = devTelegramConfirmInputSchema.safeParse(input);

		if (!parsedInput.success) {
			return { errorCode: 'invalid-input', ok: false };
		}

		const { code, firstName, lastName, telegramId, username } = parsedInput.data;
		const request = await this.dependencies.requests.findByCode(code);
		const identity: TelegramIdentity = {
			chatId: telegramId,
			firstName,
			lastName: lastName ?? null,
			telegramId,
			username: username ?? null
		};

		if (request === undefined || !await this.dependencies.requests.confirm({ id: request.id, identity, now: this.now() })) {
			return { errorCode: 'login-expired', ok: false };
		}

		return { ok: true };
	}

	/** `TelegramUpdateHandler`: the bot side. Errors reach the dispatcher, which logs them and answers Telegram 200. */
	public async handle(update: TelegramUpdate): Promise<void> {
		const botClient = this.dependencies.botClient;

		if (botClient === undefined) {
			return;
		}

		if (update.callback_query !== undefined) {
			await this.handleCallback(botClient, update.callback_query);
		}
		else if (update.message !== undefined) {
			await this.handleMessage(botClient, update.message);
		}
	}

	private async handleMessage(botClient: TelegramBotClient, message: TelegramMessage): Promise<void> {
		if (message.chat.type !== 'private' || message.from === undefined || message.from.is_bot) {
			return;
		}

		const payload = parseStartCommand(message.text);
		const { messages } = this.dependencies;

		if (payload === undefined) {
			return;
		}

		if (payload === null) {
			await botClient.sendMessage({ chatId: message.chat.id, text: messages.text('start.greeting') });

			return;
		}

		const request = isSignInCode(payload) ? await this.dependencies.requests.findByCode(payload) : undefined;

		if (request?.purpose === 'link') {
			// Same rule as below: only an offer with buttons, never a state change on `/start`.
			await botClient.sendMessage({ chatId: message.chat.id, ...await this.dependencies.link.offer(request) });

			return;
		}

		// A link request went to the link service above: what is left is a sign-in request or nothing.
		if (request === undefined || request.status !== 'pending' || request.expiresAt <= this.now()) {
			await botClient.sendMessage({ chatId: message.chat.id, text: messages.text('signIn.expired') });

			return;
		}

		const confirmButton = {
			callbackData: buildSignInCallbackData({ code: request.code, kind: 'confirm' }),
			text: messages.text('signIn.confirmButton')
		};
		const rejectButton = {
			callbackData: buildSignInCallbackData({ code: request.code, kind: 'reject' }),
			text: messages.text('signIn.rejectButton')
		};

		// No state change here: confirming on `/start` would let a link sent by someone else sign the victim in (Р11).
		await botClient.sendMessage({
			chatId: message.chat.id,
			keyboard: [[confirmButton, rejectButton]],
			text: messages.text('signIn.confirmation', {
				device: describeSignInDevice(request.userAgent) ?? messages.text('signIn.unknownDevice'),
				when: describeSignInMoment(request.createdAt, this.timeZone)
			})
		});
	}

	private async handleCallback(botClient: TelegramBotClient, query: TelegramCallbackQuery): Promise<void> {
		try {
			const signInAction = parseSignInCallbackData(query.data);
			const linkAction = signInAction === undefined ? parseLinkCallbackData(query.data) : undefined;
			const action = signInAction ?? linkAction;
			const message = query.message;

			// Buttons of a private chat with the bot only: the presser is the person the confirmation was sent to. For a
			// link this is what makes the linked Telegram the presser's own: confirming from any other chat does nothing.
			if (action === undefined || message === undefined || query.from.is_bot || message.chat.id !== query.from.id) {
				return;
			}

			const identity = toTelegramIdentity(query.from, message.chat.id);
			const { link } = this.dependencies;
			let text: string;

			if (linkAction === undefined) {
				text = action.kind === 'confirm'
					? await this.confirmFromBot(action.code, identity)
					: await this.rejectFromBot(action.code, identity);
			}
			else {
				text = linkAction.kind === 'confirm'
					? await link.confirmFromBot(linkAction.code, identity)
					: await link.rejectFromBot(linkAction.code, identity);
			}

			// Sent without buttons, so they disappear and cannot be pressed again.
			await botClient.editMessageText({ chatId: message.chat.id, messageId: message.message_id, text });
		}
		finally {
			// Always, or the button keeps spinning in the client. Its own failure must not hide the original error.
			await botClient.answerCallbackQuery({ callbackQueryId: query.id }).catch((error: unknown) => {
				console.error('Telegram answerCallbackQuery failed.', error);
			});
		}
	}

	private async confirmFromBot(code: string, identity: TelegramIdentity): Promise<string> {
		const { messages } = this.dependencies;
		const request = await this.dependencies.requests.findByCode(code);

		if (request === undefined || request.purpose !== 'sign-in') {
			return messages.text('signIn.expired');
		}

		if (!await this.dependencies.requests.confirm({ id: request.id, identity, now: this.now() })) {
			return this.settledText(request.id, identity);
		}

		// The browser learns the same at `complete`; the bot says it right away instead of a misleading «Готово».
		const known = await this.dependencies.accounts.findByTelegramId(identity.telegramId);

		return known !== undefined || this.dependencies.config.registrationEnabled
			? messages.text('signIn.confirmed')
			: messages.text('signIn.accountNotFound');
	}

	private async rejectFromBot(code: string, identity: TelegramIdentity): Promise<string> {
		const request = await this.dependencies.requests.findByCode(code);

		if (request === undefined || request.purpose !== 'sign-in') {
			return this.dependencies.messages.text('signIn.expired');
		}

		if (!await this.dependencies.requests.reject({ id: request.id, now: this.now() })) {
			return this.settledText(request.id, identity);
		}

		return this.dependencies.messages.text('signIn.rejected');
	}

	/** What the bot says when a button changed nothing: the request was already settled (a repeat) or is over. */
	private async settledText(requestId: string, identity: TelegramIdentity): Promise<string> {
		const { messages } = this.dependencies;
		const request = await this.dependencies.requests.findById(requestId);

		if (request?.status === 'rejected') {
			return messages.text('signIn.rejected');
		}

		const confirmedBySamePerson = (request?.status === 'confirmed' || request?.status === 'used')
			&& request.identity?.telegramId === identity.telegramId;

		return confirmedBySamePerson ? messages.text('signIn.confirmed') : messages.text('signIn.expired');
	}

	private async settledFailure(requestId: string): Promise<TelegramSignInCompleteOutcome> {
		const request: TelegramLoginRequest | undefined = await this.dependencies.requests.findById(requestId);

		return failed(request?.status === 'rejected' ? 'login-rejected' : 'login-expired', true);
	}
}
