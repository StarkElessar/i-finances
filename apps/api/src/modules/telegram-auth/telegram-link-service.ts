import { randomUUID } from 'node:crypto';

import type { FixedWindowRateLimiter, SignInMethodsPort } from '@/modules/auth';
import type { TelegramConfig, TelegramInlineKeyboard, TelegramMessages } from '@/modules/telegram';

import { type TelegramLinkErrorCode, telegramSignInCodeInputSchema } from '@i-finances/contracts';

import { describeLinkAccount, describeLinkLogin } from './describe-link-account';
import { describeSignInDevice, describeSignInMoment } from './describe-sign-in-request';
import { buildLinkCallbackData } from './telegram-bot-commands';
import type { TelegramIdentity } from './telegram-identity';
import type { TelegramLinkRepository } from './telegram-link-repository';
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
const DEFAULT_TIME_ZONE = 'Europe/Minsk';
/** Requests whose address is unknown share one bucket: no address must never mean «no limit». */
const UNKNOWN_ADDRESS_KEY = 'unknown';

/** The signed-in user of a browser session. Never the MCP key: the controller resolves cookie sessions only. */
export type TelegramLinkActor = {
	userId: string;
};

export type TelegramLinkMetadata = {
	ipAddress?: string;
	userAgent?: string;
};

export type TelegramLinkStartOutcome =
	| {
		appUrl: string;
		botUrl: string;
		code: string;
		expiresAt: Date;
		ok: true;
		/** Goes into the httpOnly cookie and nowhere else. */
		secret: string;
		ttlMilliseconds: number;
	}
	| {
		errorCode: Extract<TelegramLinkErrorCode, 'account-has-telegram' | 'rate-limited' | 'telegram-unavailable' | 'unauthenticated'>;
		ok: false;
		retryAfterSeconds?: number;
	};

export type TelegramLinkCompleteOutcome =
	| { kind: 'pending' }
	| { kind: 'linked'; username: string | null }
	| {
		/** The request is over for this browser: its cookie can go. */
		endsRequest: boolean;
		errorCode: TelegramLinkErrorCode;
		kind: 'failed';
		retryAfterSeconds?: number;
	};

/** A bot message: the text and, for a confirmation, its buttons. */
export type TelegramLinkBotMessage = {
	keyboard?: TelegramInlineKeyboard;
	text: string;
};

export type TelegramLinkServiceDependencies = {
	/** The same limiter as the sign-in `complete` and `cancel`: 300 per 5 minutes per address (Р11). */
	completeRateLimiter: Pick<FixedWindowRateLimiter, 'tryConsume'>;
	config: Pick<TelegramConfig, 'botUsername' | 'loginTtlMilliseconds' | 'signInAvailable' | 'siteHost'>;
	createCode?: () => string;
	createId?: () => string;
	createSecret?: () => string;
	links: Pick<TelegramLinkRepository, 'assess' | 'complete'>;
	messages: TelegramMessages;
	now?: () => Date;
	requests: Pick<TelegramLoginRequestRepository, 'confirm' | 'deleteCreatedBefore' | 'findByCode' | 'findById' | 'insert' | 'reject'>;
	signInMethods: SignInMethodsPort;
	/** The same limiter as the sign-in `start`: 10 per 5 minutes per address (Р11). */
	startRateLimiter: Pick<FixedWindowRateLimiter, 'tryConsume'>;
	timeZone?: string;
};

function failed(errorCode: TelegramLinkErrorCode, endsRequest: boolean, retryAfterSeconds?: number): TelegramLinkCompleteOutcome {
	return { endsRequest, errorCode, kind: 'failed', retryAfterSeconds };
}

function addressKey(metadata: TelegramLinkMetadata): string {
	return metadata.ipAddress ?? UNKNOWN_ADDRESS_KEY;
}

/**
 * Linking Telegram to the signed-in user (Р9, flow 5.3), so that the owner and the family member link Telegram before
 * registration is switched on and no duplicates appear.
 *
 * 1. `start` (browser session only): a `link` request for this user, the code for the bot link, the secret for the
 *    browser cookie (hash only in the database). Refused when the user already has a Telegram: v1 cannot unlink.
 * 2. `/start <code>` (bot, through the sign-in service which routes by purpose): the bot names the account and the
 *    device of the request and offers «Привязать» / «Это не я». Nothing changes yet, so a link sent by somebody else
 *    cannot link the victim's Telegram to the sender's account without the victim reading whose account it is (Р11).
 * 3. «Привязать» (`callback_query` in the presser's own private chat, checked by the sign-in service):
 *    `pending → confirmed` with the identity from `callback_query.from`. The Telegram linked is always the presser's.
 * 4. `complete` (browser polling): only the same user in the same browser, once, while alive; `TelegramLinkRepository`
 *    consumes the request and links, merges an empty duplicate, or refuses with 409, all in one transaction.
 */
export class TelegramLinkService {
	private readonly createCode: () => string;
	private readonly createId: () => string;
	private readonly createSecret: () => string;
	private readonly now: () => Date;
	private readonly timeZone: string;

	public constructor(private readonly dependencies: TelegramLinkServiceDependencies) {
		this.createCode = dependencies.createCode ?? generateTelegramLoginCode;
		this.createId = dependencies.createId ?? randomUUID;
		this.createSecret = dependencies.createSecret ?? generateTelegramLoginSecret;
		this.now = dependencies.now ?? (() => new Date());
		this.timeZone = dependencies.timeZone ?? DEFAULT_TIME_ZONE;
	}

	public async start(actor: TelegramLinkActor, metadata: TelegramLinkMetadata): Promise<TelegramLinkStartOutcome> {
		const { botUsername, loginTtlMilliseconds, signInAvailable } = this.dependencies.config;

		if (!signInAvailable || botUsername === undefined) {
			return { errorCode: 'telegram-unavailable', ok: false };
		}

		const now = this.now();
		const limit = this.dependencies.startRateLimiter.tryConsume(addressKey(metadata), now.getTime());

		if (!limit.allowed) {
			return { errorCode: 'rate-limited', ok: false, retryAfterSeconds: limit.retryAfterSeconds };
		}

		const methods = await this.dependencies.signInMethods.read(actor.userId);

		if (methods === undefined || !methods.isActive) {
			return { errorCode: 'unauthenticated', ok: false };
		}

		if (methods.telegram !== null) {
			return { errorCode: 'account-has-telegram', ok: false };
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
			linkUserId: actor.userId,
			purpose: 'link',
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
	 * The polling step. Before the request is known to be this user's link request started by this browser, every
	 * answer is the same `browser-mismatch`: unknown, foreign, sign-in, other user's, expired and used codes look alike.
	 */
	public async complete(
		actor: TelegramLinkActor,
		input: unknown,
		secret: string | undefined,
		metadata: TelegramLinkMetadata
	): Promise<TelegramLinkCompleteOutcome> {
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

		if (
			request === undefined
			|| request.purpose !== 'link'
			|| request.linkUserId !== actor.userId
			|| !telegramLoginSecretMatches(request.secretHash, secret)
		) {
			return failed('browser-mismatch', false);
		}

		if (request.status === 'pending') {
			return request.expiresAt > now ? { kind: 'pending' } : failed('link-expired', true);
		}

		if (request.status !== 'confirmed') {
			return failed(request.status === 'rejected' ? 'link-rejected' : 'link-expired', true);
		}

		// The transaction decides, not the row read above: a parallel poll may have taken it, or it expired meanwhile.
		const completion = await this.dependencies.links.complete({
			linkUserId: actor.userId,
			now,
			requestId: request.id,
			secretHash: hashTelegramLoginSecret(secret ?? '')
		});

		switch (completion.kind) {
			case 'not-consumed': {
				const settled = await this.dependencies.requests.findById(request.id);

				return failed(settled?.status === 'rejected' ? 'link-rejected' : 'link-expired', true);
			}
			case 'linked':
				return { kind: 'linked', username: completion.username };
			case 'account-has-telegram':
			case 'telegram-linked-elsewhere':
				return failed(completion.kind, true);
		}
	}

	/** The bot's answer to `/start <code>` of a link request: the confirmation with buttons, or «expired». */
	public async offer(request: TelegramLoginRequest): Promise<TelegramLinkBotMessage> {
		const { messages } = this.dependencies;
		const methods = request.linkUserId === null ? undefined : await this.dependencies.signInMethods.read(request.linkUserId);

		if (request.purpose !== 'link' || request.status !== 'pending' || request.expiresAt <= this.now() || methods === undefined) {
			return { text: messages.text('link.expired') };
		}

		const confirmButton = {
			callbackData: buildLinkCallbackData({ code: request.code, kind: 'confirm' }),
			text: messages.text('link.confirmButton')
		};
		const rejectButton = {
			callbackData: buildLinkCallbackData({ code: request.code, kind: 'reject' }),
			text: messages.text('link.rejectButton')
		};

		return {
			keyboard: [[confirmButton, rejectButton]],
			text: messages.text('link.confirmation', {
				account: describeLinkAccount(methods.displayName, methods.username),
				device: describeSignInDevice(request.userAgent) ?? messages.text('signIn.unknownDevice'),
				login: describeLinkLogin(methods.username),
				site: this.dependencies.config.siteHost,
				when: describeSignInMoment(request.createdAt, this.timeZone)
			})
		};
	}

	/**
	 * «Привязать». `identity` is the presser, taken from `callback_query.from` in the presser's private chat with the
	 * bot (the sign-in service checks the chat before calling): one can only ever link one's own Telegram.
	 */
	public async confirmFromBot(code: string, identity: TelegramIdentity): Promise<string> {
		const { messages } = this.dependencies;
		const request = await this.dependencies.requests.findByCode(code);

		if (request === undefined || request.purpose !== 'link' || request.linkUserId === null) {
			return messages.text('link.expired');
		}

		if (!await this.dependencies.requests.confirm({ id: request.id, identity, now: this.now() })) {
			return this.settledText(request.id, identity);
		}

		// Tells the presser right away what `complete` will say; `complete` decides again in its own transaction.
		const assessment = await this.dependencies.links.assess(request.linkUserId, identity.telegramId);

		if (assessment.kind === 'telegram-linked-elsewhere') {
			return messages.text('link.telegramTaken');
		}

		if (assessment.kind === 'account-has-telegram') {
			const methods = await this.dependencies.signInMethods.read(request.linkUserId);

			return messages.text('link.accountHasTelegram', {
				account: methods === undefined ? '' : describeLinkAccount(methods.displayName, methods.username),
				login: methods === undefined ? '' : describeLinkLogin(methods.username)
			});
		}

		return messages.text('link.confirmed');
	}

	/** «Это не я»: the link request is rejected and can never be confirmed or completed. */
	public async rejectFromBot(code: string, identity: TelegramIdentity): Promise<string> {
		const request = await this.dependencies.requests.findByCode(code);

		if (request === undefined || request.purpose !== 'link') {
			return this.dependencies.messages.text('link.expired');
		}

		if (!await this.dependencies.requests.reject({ id: request.id, now: this.now() })) {
			return this.settledText(request.id, identity);
		}

		return this.dependencies.messages.text('link.rejected');
	}

	private async settledText(requestId: string, identity: TelegramIdentity): Promise<string> {
		const { messages } = this.dependencies;
		const request = await this.dependencies.requests.findById(requestId);

		if (request?.status === 'rejected') {
			return messages.text('link.rejected');
		}

		const confirmedBySamePerson = (request?.status === 'confirmed' || request?.status === 'used')
			&& request.identity?.telegramId === identity.telegramId;

		return confirmedBySamePerson ? messages.text('link.confirmed') : messages.text('link.expired');
	}
}
