import { ApiKeySessionResolver } from '@/http/api-key-session-resolver';
import { CompositeSessionResolver } from '@/http/composite-session-resolver';
import type { RequestSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { users } from '@/infrastructure/database/schema';
import type { AuthenticatedSession } from '@/modules/auth';
import { PasswordUserRepository } from '@/modules/auth';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'mcp-user';
const API_KEY = 'a'.repeat(48);
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');

let connection: Database.Database;
let database: AppDatabase;
let userRepository: PasswordUserRepository;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	userRepository = new PasswordUserRepository(database);
	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: 'Sergei Test',
		id: USER_ID,
		isActive: true,
		passwordHash: 'hash',
		updatedAt: FIXED_DATE,
		username: 'sergei'
	});
});

afterEach(() => {
	connection.close();
});

function bearerRequest(token: string | undefined): Request {
	const headers = new Headers();

	if (token !== undefined) {
		headers.set('authorization', `Bearer ${token}`);
	}

	return new Request('http://localhost/api/accounts', { headers });
}

describe('ApiKeySessionResolver', () => {
	it('resolves the configured user for a matching bearer token', async () => {
		const resolver = new ApiKeySessionResolver(userRepository, API_KEY, USER_ID);
		const session = await resolver.resolve(bearerRequest(API_KEY));

		expect(session).toMatchObject({
			user: { id: USER_ID, username: 'sergei' }
		});
	});

	it('rejects a wrong token', async () => {
		const resolver = new ApiKeySessionResolver(userRepository, API_KEY, USER_ID);

		expect(await resolver.resolve(bearerRequest('wrong-token-wrong-token-wrong-token'))).toBeNull();
	});

	it('rejects a missing authorization header', async () => {
		const resolver = new ApiKeySessionResolver(userRepository, API_KEY, USER_ID);

		expect(await resolver.resolve(bearerRequest(undefined))).toBeNull();
	});

	it('returns null when MCP_API_KEY is not configured', async () => {
		const resolver = new ApiKeySessionResolver(userRepository, undefined, USER_ID);

		expect(await resolver.resolve(bearerRequest(API_KEY))).toBeNull();
	});

	it('returns null when the configured user does not exist', async () => {
		const resolver = new ApiKeySessionResolver(userRepository, API_KEY, 'no-such-user');

		expect(await resolver.resolve(bearerRequest(API_KEY))).toBeNull();
	});

	it('returns null when the configured user is inactive', async () => {
		await database.update(users).set({ isActive: false }).where(eq(users.id, USER_ID));

		const resolver = new ApiKeySessionResolver(userRepository, API_KEY, USER_ID);

		expect(await resolver.resolve(bearerRequest(API_KEY))).toBeNull();
	});
});

describe('CompositeSessionResolver', () => {
	const noSessionResolver: RequestSessionResolver = { resolve: async () => null };
	const authenticatedSession: AuthenticatedSession = {
		expiresAt: FIXED_DATE,
		id: 'session-1',
		user: { displayName: 'Sergei Test', id: USER_ID, username: 'sergei' }
	};
	const cookieSessionResolver: RequestSessionResolver = { resolve: async () => authenticatedSession };

	it('returns the first non-null session', async () => {
		const resolver = new CompositeSessionResolver([noSessionResolver, cookieSessionResolver]);

		expect(await resolver.resolve(bearerRequest(undefined))).toEqual(authenticatedSession);
	});

	it('returns null when every resolver returns null', async () => {
		const resolver = new CompositeSessionResolver([noSessionResolver, noSessionResolver]);

		expect(await resolver.resolve(bearerRequest(undefined))).toBeNull();
	});
});
