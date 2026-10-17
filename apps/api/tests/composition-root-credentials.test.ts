import type { createApiApp as CreateApiApp } from '@/app';
import * as schema from '@/infrastructure/database/schema';
import { householdMembers, households, users } from '@/infrastructure/database/schema';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const API_KEY = 'k'.repeat(48);
const USER_ID = 'mcp-user';
const ORIGIN = 'http://localhost:5173';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');
const BEARER = { authorization: `Bearer ${API_KEY}` };

let app: ReturnType<typeof CreateApiApp>;
let closeDatabase: () => void;

/**
 * Runs against the real production object graph (`createApiDependencies`), so a
 * resolver wired into the wrong controller is caught here and nowhere else.
 */
beforeAll(async () => {
	vi.stubEnv('DATABASE_URL', ':memory:');
	vi.stubEnv('MCP_API_KEY', API_KEY);
	vi.stubEnv('MCP_USER_ID', USER_ID);
	vi.stubEnv('AUTH_ORIGIN', ORIGIN);
	vi.resetModules();
	delete (globalThis as { iFinancesSqlite?: unknown }).iFinancesSqlite;

	const { sqlite, db } = await import('@/infrastructure/database/client');
	const { createApiApp } = await import('@/app');
	const { createApiDependencies } = await import('@/composition-root');

	closeDatabase = () => sqlite.close();
	migrate(drizzle(sqlite, { schema }), { migrationsFolder: './drizzle' });
	await db.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: 'MCP owner',
		id: USER_ID,
		isActive: true,
		passwordHash: 'stored-hash',
		updatedAt: FIXED_DATE,
		username: 'mcp-owner'
	});
	await db.insert(households).values({
		baseCurrency: 'BYN',
		createdAt: FIXED_DATE,
		id: 'default-household',
		name: 'Семья',
		updatedAt: FIXED_DATE
	});
	await db.insert(householdMembers).values({
		householdId: 'default-household',
		joinedAt: FIXED_DATE,
		role: 'owner',
		userId: USER_ID
	});
	app = createApiApp(createApiDependencies());
});

afterAll(() => {
	closeDatabase();
	delete (globalThis as { iFinancesSqlite?: unknown }).iFinancesSqlite;
	vi.unstubAllEnvs();
});

describe('machine bearer key on credential routes (production wiring)', () => {
	it('is a working credential for ordinary data routes (control)', async () => {
		const response = await app.request('/api/accounts', { headers: BEARER });

		expect(response.status).toBe(200);
	});

	it('cannot read or change sessions', async () => {
		const response = await app.request('/api/security/sessions', { headers: BEARER });

		expect(response.status).toBe(401);
	});

	it('cannot change the password or end sessions', async () => {
		const password = await app.request('/api/security/password', {
			body: JSON.stringify({ currentPassword: 'stored-hash', newPassword: 'a-long-enough-password' }),
			headers: { ...BEARER, 'content-type': 'application/json', origin: ORIGIN },
			method: 'POST'
		});
		const others = await app.request('/api/security/sessions/others', {
			headers: { ...BEARER, origin: ORIGIN },
			method: 'DELETE'
		});

		expect(password.status).toBe(401);
		expect(others.status).toBe(401);
	});

	it('cannot start or finish a passkey registration', async () => {
		const options = await app.request('/api/auth/passkey/registration/options', {
			headers: { ...BEARER, origin: ORIGIN },
			method: 'POST'
		});
		const verification = await app.request('/api/auth/passkey/registration/verification', {
			body: JSON.stringify({}),
			headers: { ...BEARER, 'content-type': 'application/json', origin: ORIGIN },
			method: 'POST'
		});

		expect(options.status).toBe(401);
		expect(verification.status).toBe(401);
	});

	it('still lets passkey sign-in start without any session', async () => {
		const response = await app.request('/api/auth/passkey/sign-in/options', {
			headers: { origin: ORIGIN },
			method: 'POST'
		});

		expect(response.status).toBe(200);
	});
});
