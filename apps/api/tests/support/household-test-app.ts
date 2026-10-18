import { createApiApp } from '@/app';
import { HouseholdHttpController } from '@/http/household-controller';
import { HouseholdInvitationHttpController } from '@/http/household-invitation-controller';
import { CookieSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import { householdMembers, households, users } from '@/infrastructure/database/schema';
import { type AuthConfig, FixedWindowRateLimiter, SessionRepository, SessionService } from '@/modules/auth';
import {
	HouseholdInvitationRepository,
	HouseholdInvitationService,
	HouseholdMembershipRepository,
	HouseholdRepository,
	HouseholdResolver,
	HouseholdService
} from '@/modules/household';
import { loadTelegramMessages, type TelegramBotClient } from '@/modules/telegram';
import { HouseholdMemberJoinedNotifier, TelegramAccountRepository } from '@/modules/telegram-auth';

import { FakeTelegramBotClient } from './fake-telegram-bot-client';

export const TEST_ORIGIN = 'http://localhost:5173';

export const TEST_AUTH_CONFIG: AuthConfig = {
	origin: TEST_ORIGIN,
	sessionCookieName: 'test_session',
	sessionTtlMilliseconds: 30 * 24 * 60 * 60 * 1000,
	trustedProxyCount: 0,
	webauthnRpId: 'localhost',
	webauthnRpName: 'iFinances'
};

export const HOUR = 60 * 60 * 1000;

export const DAY = 24 * HOUR;

export const DEFAULT_INVITATION_TTL = 168 * HOUR;

export type TestRequest = {
	body?: unknown;
	/** Defaults to the test origin; `null` sends none. */
	origin?: string | null;
	headers?: Record<string, string>;
	method?: string;
	/** Session token of the caller, as `signIn` returned it. */
	token?: string;
};

/**
 * The household and invitation routes on the real repositories, services, controllers and cookie sessions over the
 * given database. The clock of the household services is `clock.now` (sessions use the real time, so moving the clock
 * a week forward does not sign anyone out). The bot is a `FakeTelegramBotClient` unless `botClient` is given: nothing
 * reaches Telegram from a test.
 */
export function createHouseholdTestApp(
	database: AppDatabase,
	ttlMilliseconds = DEFAULT_INVITATION_TTL,
	options: { botClient?: TelegramBotClient } = {}
) {
	const clock = { now: new Date('2026-10-18T10:00:00.000Z') };
	const botClient = options.botClient ?? new FakeTelegramBotClient();
	const now = () => clock.now;
	const sessionRepository = new SessionRepository(database);
	const sessionService = new SessionService(sessionRepository, { config: TEST_AUTH_CONFIG });
	const sessionResolver = new CookieSessionResolver(sessionService, TEST_AUTH_CONFIG.sessionCookieName);
	const householdRepository = new HouseholdRepository(database);
	const householdResolver = new HouseholdResolver(householdRepository);
	const acceptRateLimiter = new FixedWindowRateLimiter({ maxRequests: 10, windowMilliseconds: 5 * 60 * 1000 });
	const previewRateLimiter = new FixedWindowRateLimiter({ maxRequests: 30, windowMilliseconds: 5 * 60 * 1000 });
	let nextHouseholdId = 0;
	const householdService = new HouseholdService({
		createId: () => `created-household-${++nextHouseholdId}`,
		householdRepository,
		householdResolver,
		membershipRepository: new HouseholdMembershipRepository(database, sessionRepository),
		now
	});
	const invitationService = new HouseholdInvitationService({
		acceptRateLimiter,
		config: { ttlMilliseconds },
		householdResolver,
		invitations: new HouseholdInvitationRepository(database),
		memberJoinedNotifier: new HouseholdMemberJoinedNotifier({
			accounts: new TelegramAccountRepository(database),
			botClient,
			messages: loadTelegramMessages(),
			now
		}),
		now,
		origin: TEST_ORIGIN,
		previewRateLimiter
	});
	const app = createApiApp({
		householdController: new HouseholdHttpController(householdService, sessionResolver, TEST_AUTH_CONFIG),
		householdInvitationController: new HouseholdInvitationHttpController(invitationService, sessionResolver, TEST_AUTH_CONFIG)
	});

	async function signIn(userId: string): Promise<string> {
		return (await sessionService.createSession(userId)).token;
	}

	async function call(path: string, request: TestRequest = {}): Promise<Response> {
		const method = request.method ?? (request.body === undefined ? 'GET' : 'POST');

		return app.request(path, {
			body: request.body === undefined ? undefined : JSON.stringify(request.body),
			headers: {
				...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
				...(request.token === undefined ? {} : { cookie: `${TEST_AUTH_CONFIG.sessionCookieName}=${request.token}` }),
				...(request.origin === null ? {} : { origin: request.origin ?? TEST_ORIGIN }),
				...request.headers
			},
			method
		});
	}

	return { acceptRateLimiter, app, botClient, call, clock, previewRateLimiter, signIn };
}

export async function insertUser(database: AppDatabase, id: string, displayName: string): Promise<void> {
	const at = new Date('2026-10-01T10:00:00.000Z');

	await database.insert(users).values({
		createdAt: at,
		displayName,
		id,
		isActive: true,
		passwordHash: null,
		updatedAt: at,
		username: id
	});
}

export async function insertHousehold(
	database: AppDatabase,
	id: string,
	name: string,
	members: Array<{ role: 'member' | 'owner'; userId: string }>
): Promise<void> {
	const at = new Date('2026-10-01T10:00:00.000Z');

	await database.insert(households).values({ baseCurrency: 'BYN', createdAt: at, id, name, updatedAt: at });

	if (members.length > 0) {
		await database.insert(householdMembers).values(members.map((member, index) => ({
			householdId: id,
			joinedAt: new Date(at.getTime() + index * 1000),
			role: member.role,
			userId: member.userId
		})));
	}
}
