import { createHash } from 'node:crypto';

import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { householdMembers, households } from '@/infrastructure/database/schema';
import { getHouseholdInvitationConfig, HouseholdInvitationRepository, HouseholdInvitationService } from '@/modules/household';

import {
	acceptInvitationResultSchema,
	createHouseholdInvitationResultSchema,
	householdInvitationsResultSchema,
	invitationPreviewResultSchema
} from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createHouseholdTestApp,
	DAY,
	DEFAULT_INVITATION_TTL,
	HOUR,
	insertHousehold,
	insertUser,
	TEST_ORIGIN
} from './support/household-test-app';

/**
 * A6: household invitations (Р5, flow 5.4) over HTTP with real cookie sessions, repositories and services.
 *
 * Household «Семья» has the owner Сергей and the member Анна; «Чужие» belongs to Борис and has data; Олег has no
 * household; Соло is alone in an empty household of their own.
 */

const OWNER = 'owner';

const MEMBER = 'member';

const NEWCOMER = 'newcomer';

const SECOND_NEWCOMER = 'newcomer-2';

const OTHER_OWNER = 'other-owner';

const SOLO = 'solo';

const FAMILY = 'family-household';

const OTHER = 'other-household';

const SOLO_HOUSEHOLD = 'solo-household';

const TOKEN_LINK = new RegExp(`^${TEST_ORIGIN}/invite/([A-Za-z0-9_-]{43})$`, 'u');

const UNKNOWN_TOKEN = 'u'.repeat(43);

let connection: Database.Database;

let database: AppDatabase;

let harness: ReturnType<typeof createHouseholdTestApp>;

const tokens: Record<string, string> = {};

function insertCategory(householdId: string, createdBy: string, id = `category-${householdId}`): void {
	connection.prepare(`INSERT INTO categories (id, household_id, name, normalized_name, color, created_by_user_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, '#3f77a8', ?, 0, 0)`).run(id, householdId, id, id, createdBy);
}

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });

	for (const [id, name] of [
		[OWNER, 'Сергей'],
		[MEMBER, 'Анна'],
		[NEWCOMER, 'Олег'],
		[SECOND_NEWCOMER, 'Ольга'],
		[OTHER_OWNER, 'Борис'],
		[SOLO, 'Соло']
	]) {
		await insertUser(database, id, name);
	}

	await insertHousehold(database, FAMILY, 'Семья', [{ role: 'owner', userId: OWNER }, { role: 'member', userId: MEMBER }]);
	await insertHousehold(database, OTHER, 'Чужие', [{ role: 'owner', userId: OTHER_OWNER }]);
	await insertHousehold(database, SOLO_HOUSEHOLD, 'Пустое', [{ role: 'owner', userId: SOLO }]);
	insertCategory(OTHER, OTHER_OWNER);

	harness = createHouseholdTestApp(database);

	for (const userId of [OWNER, MEMBER, NEWCOMER, SECOND_NEWCOMER, OTHER_OWNER, SOLO]) {
		tokens[userId] = await harness.signIn(userId);
	}
});

afterEach(() => {
	connection.close();
	vi.restoreAllMocks();
});

async function createInvitation(userId = OWNER): Promise<{ id: string; token: string }> {
	const response = await harness.call('/api/household/invitations', { method: 'POST', token: tokens[userId] });
	const body = createHouseholdInvitationResultSchema.parse(await response.json());

	expect(response.status, JSON.stringify(body)).toBe(201);

	if (!body.ok) {
		throw new Error('not created');
	}

	const token = TOKEN_LINK.exec(body.invitation.link)?.[1];

	expect(token, body.invitation.link).toBeDefined();

	return { id: body.invitation.id, token: token as string };
}

function preview(token: string, ip = '203.0.113.7') {
	return harness.app.request('/api/invitations/preview', {
		body: JSON.stringify({ token }),
		headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
		method: 'POST'
	}, { incoming: { socket: { remoteAddress: ip } } });
}

function accept(userId: string, token: string, extra: Record<string, unknown> = {}) {
	return harness.call('/api/invitations/accept', { body: { token, ...extra }, token: tokens[userId] });
}

function invitationRow(id: string) {
	return connection.prepare('SELECT * FROM household_invitations WHERE id = ?').get(id) as Record<string, unknown>;
}

function membershipOf(userId: string) {
	return connection.prepare('SELECT household_id, role FROM household_members WHERE user_id = ?').get(userId);
}

function snapshot(): string {
	const tables = ['household_invitations', 'household_members', 'households', 'sessions', 'categories'];

	return JSON.stringify(tables.map((table) => connection.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()));
}

async function deadInvitations(): Promise<Record<'expired' | 'revoked' | 'used', string>> {
	const expired = await createInvitation();
	const revoked = await createInvitation();
	const used = await createInvitation();

	connection.prepare('UPDATE household_invitations SET expires_at = ? WHERE id = ?').run(harness.clock.now.getTime() - 1, expired.id);
	const revokedAnswer = await harness.call(`/api/household/invitations/${revoked.id}/revoke`, { method: 'POST', token: tokens[OWNER] });

	expect(revokedAnswer.status).toBe(200);
	expect((await accept(NEWCOMER, used.token)).status).toBe(200);

	return { expired: expired.token, revoked: revoked.token, used: used.token };
}

describe('creating an invitation', () => {
	it('answers the link once, stores only the SHA-256 of a 256-bit token, lives 7 days by default', async () => {
		const { id, token } = await createInvitation();
		const row = invitationRow(id);

		expect(Buffer.from(token, 'base64url')).toHaveLength(32);
		expect(row).toMatchObject({
			accepted_at: null,
			accepted_by_user_id: null,
			created_at: harness.clock.now.getTime(),
			created_by_user_id: OWNER,
			expires_at: harness.clock.now.getTime() + DEFAULT_INVITATION_TTL,
			household_id: FAMILY,
			revoked_at: null,
			token_hash: createHash('sha256').update(token).digest('hex')
		});
		// The token is nowhere in the database, in no form but its hash.
		const tables = connection.prepare('SELECT name FROM sqlite_master WHERE type = \'table\'').all() as Array<{ name: string }>;
		const everything = JSON.stringify(tables.map(({ name }) => connection.prepare(`SELECT * FROM "${name}"`).all()));

		expect(everything).not.toContain(token);
		expect(DEFAULT_INVITATION_TTL).toBe(7 * DAY);
	});

	it('two invitations get different tokens', async () => {
		const first = await createInvitation();
		const second = await createInvitation();

		expect(first.token).not.toBe(second.token);
	});

	it('takes the lifetime from HOUSEHOLD_INVITATION_TTL_HOURS', async () => {
		connection.close();
		connection = new Database(':memory:');
		connection.pragma('foreign_keys = ON');
		database = drizzle(connection, { schema });
		migrate(database, { migrationsFolder: './drizzle' });
		await insertUser(database, OWNER, 'Сергей');
		await insertHousehold(database, FAMILY, 'Семья', [{ role: 'owner', userId: OWNER }]);
		harness = createHouseholdTestApp(database, getHouseholdInvitationConfig({ HOUSEHOLD_INVITATION_TTL_HOURS: '72' }).ttlMilliseconds);
		tokens[OWNER] = await harness.signIn(OWNER);

		const { id } = await createInvitation();

		expect(invitationRow(id).expires_at).toBe(harness.clock.now.getTime() + 72 * HOUR);
	});

	it('only the owner creates, lists and revokes; the member gets 403 and nothing changes', async () => {
		const { id } = await createInvitation();
		const before = snapshot();

		for (const [path, method] of [
			['/api/household/invitations', 'POST'],
			['/api/household/invitations', 'GET'],
			[`/api/household/invitations/${id}/revoke`, 'POST']
		]) {
			const response = await harness.call(path, { method, token: tokens[MEMBER] });

			expect(response.status, `${method} ${path}`).toBe(403);
			expect(await response.json()).toMatchObject({ errorCode: 'owner-required', ok: false });
		}

		expect(snapshot()).toBe(before);
	});

	it('a user without a household gets household-required on the owner routes', async () => {
		for (const [path, method] of [['/api/household/invitations', 'POST'], ['/api/household/invitations', 'GET']]) {
			const response = await harness.call(path, { method, token: tokens[NEWCOMER] });

			expect(response.status).toBe(403);
			expect(await response.json()).toMatchObject({ errorCode: 'household-required' });
		}
	});

	it('refuses without a session and from another origin', async () => {
		expect((await harness.call('/api/household/invitations', { method: 'POST' })).status).toBe(401);
		expect((await harness.call('/api/household/invitations', { method: 'GET' })).status).toBe(401);

		const foreign = await harness.call('/api/household/invitations', {
			method: 'POST',
			origin: 'https://evil.example',
			token: tokens[OWNER]
		});

		expect(foreign.status).toBe(403);
		expect(await foreign.json()).toMatchObject({ errorCode: 'invalid-origin' });
		expect(connection.prepare('SELECT count(*) AS count FROM household_invitations').get()).toEqual({ count: 0 });
	});

	it('allows at most 3 active invitations; revoked, used and expired ones do not count', async () => {
		const created = [await createInvitation(), await createInvitation(), await createInvitation()];
		const fourth = await harness.call('/api/household/invitations', { method: 'POST', token: tokens[OWNER] });

		expect(fourth.status).toBe(409);
		expect(await fourth.json()).toMatchObject({ errorCode: 'invitation-limit-reached', ok: false });
		expect(connection.prepare('SELECT count(*) AS count FROM household_invitations').get()).toEqual({ count: 3 });

		await harness.call(`/api/household/invitations/${created[0].id}/revoke`, { method: 'POST', token: tokens[OWNER] });
		await accept(NEWCOMER, created[1].token);
		connection.prepare('UPDATE household_invitations SET expires_at = ? WHERE id = ?').run(harness.clock.now.getTime(), created[2].id);

		await createInvitation();
		await createInvitation();
		await createInvitation();
		expect((await harness.call('/api/household/invitations', { method: 'POST', token: tokens[OWNER] })).status).toBe(409);
	});

	it('allows 10 invitations per household per 24 hours, whatever happened to them', async () => {
		for (let index = 0; index < 10; index += 1) {
			const { id } = await createInvitation();

			await harness.call(`/api/household/invitations/${id}/revoke`, { method: 'POST', token: tokens[OWNER] });
		}

		const eleventh = await harness.call('/api/household/invitations', { method: 'POST', token: tokens[OWNER] });

		expect(eleventh.status).toBe(429);
		expect(await eleventh.json()).toMatchObject({ errorCode: 'rate-limited' });

		// Another household is not affected, and a day later the family may invite again.
		await createInvitation(OTHER_OWNER);
		harness.clock.now = new Date(harness.clock.now.getTime() + DAY);
		await createInvitation();
	});
});

describe('listing and revoking', () => {
	it('lists only active invitations of the own household, without token, link or hash', async () => {
		const { used } = await deadInvitations();
		const active = await createInvitation();
		await createInvitation(OTHER_OWNER);

		const response = await harness.call('/api/household/invitations', { token: tokens[OWNER] });
		const text = await response.text();
		const body = householdInvitationsResultSchema.parse(JSON.parse(text));

		expect(response.status).toBe(200);
		expect(body).toEqual({
			invitations: [{
				createdAt: harness.clock.now.toISOString(),
				createdBy: { displayName: 'Сергей' },
				expiresAt: new Date(harness.clock.now.getTime() + DEFAULT_INVITATION_TTL).toISOString(),
				id: active.id
			}],
			ok: true
		});
		expect(text).not.toContain(active.token);
		expect(text).not.toContain(used);
		expect(text).not.toContain('invite');
		expect(text).not.toContain(invitationRow(active.id).token_hash as string);
	});

	it('revokes once; an unknown id, a used one and another household\'s invitation answer the same 404', async () => {
		const own = await createInvitation();
		const foreign = await createInvitation(OTHER_OWNER);
		const revoke = (id: string, userId = OWNER) => harness.call(`/api/household/invitations/${id}/revoke`, {
			method: 'POST',
			token: tokens[userId]
		});

		expect((await revoke(own.id)).status).toBe(200);
		expect(invitationRow(own.id).revoked_at).toBe(harness.clock.now.getTime());

		const again = await revoke(own.id);
		const unknown = await revoke('no-such-invitation');
		const foreignAnswer = await revoke(foreign.id);
		const answers = [again, unknown, foreignAnswer];
		const texts = await Promise.all(answers.map((answer) => answer.text()));

		expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404]);
		expect(new Set(texts).size).toBe(1);
		expect(JSON.parse(texts[0])).toMatchObject({ errorCode: 'invitation-not-found', ok: false });
		expect(invitationRow(foreign.id).revoked_at).toBeNull();
		expect((await preview(foreign.token)).status).toBe(200);
	});

	it('a revoked invitation cannot be accepted', async () => {
		const { id, token } = await createInvitation();

		await harness.call(`/api/household/invitations/${id}/revoke`, { method: 'POST', token: tokens[OWNER] });

		const response = await accept(NEWCOMER, token);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ errorCode: 'invitation-unavailable' });
		expect(membershipOf(NEWCOMER)).toBeUndefined();
	});
});

describe('preview', () => {
	it('shows the household name, the inviter and the deadline, without a session', async () => {
		const { token } = await createInvitation();
		const response = await preview(token);

		expect(response.status).toBe(200);
		expect(invitationPreviewResultSchema.parse(await response.clone().json())).toEqual({
			invitation: {
				expiresAt: new Date(harness.clock.now.getTime() + DEFAULT_INVITATION_TTL).toISOString(),
				householdName: 'Семья',
				inviterName: 'Сергей'
			},
			ok: true
		});
		// Nothing beyond the contract: no ids, no member list.
		expect(Object.keys(((await response.json()) as { invitation: object }).invitation).sort())
			.toEqual(['expiresAt', 'householdName', 'inviterName']);
	});

	it('answers an unknown, an expired, a used and a revoked token exactly alike', async () => {
		const dead = await deadInvitations();
		const answers = await Promise.all([UNKNOWN_TOKEN, dead.expired, dead.used, dead.revoked].map(async (token) => {
			const response = await preview(token);

			return `${response.status} ${response.headers.get('content-type')} ${await response.text()}`;
		}));

		expect(new Set(answers).size).toBe(1);
		expect(answers[0]).toMatch(/^404 /u);
		expect(answers[0]).toContain('invitation-unavailable');
		expect(answers[0]).not.toMatch(/Семья|Сергей/u);
	});

	it('an invitation stops working the moment it expires', async () => {
		const { token } = await createInvitation();

		harness.clock.now = new Date(harness.clock.now.getTime() + DEFAULT_INVITATION_TTL - 1);
		expect((await preview(token)).status).toBe(200);
		harness.clock.now = new Date(harness.clock.now.getTime() + 1);
		expect((await preview(token)).status).toBe(404);
		expect((await accept(NEWCOMER, token)).status).toBe(404);
		expect(membershipOf(NEWCOMER)).toBeUndefined();
	});

	it('refuses a malformed token with 400 and a foreign origin with 403', async () => {
		const malformed = await preview('short');

		expect(malformed.status).toBe(400);
		expect(await malformed.json()).toMatchObject({ errorCode: 'invalid-input' });

		const foreign = await harness.app.request('/api/invitations/preview', {
			body: JSON.stringify({ token: UNKNOWN_TOKEN }),
			headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
			method: 'POST'
		});

		expect(foreign.status).toBe(403);
	});

	it('is limited to 30 per 5 minutes per client address', async () => {
		const { token } = await createInvitation();

		for (let index = 0; index < 30; index += 1) {
			expect((await preview(UNKNOWN_TOKEN)).status).toBe(404);
		}

		const limited = await preview(token);

		expect(limited.status).toBe(429);
		expect(limited.headers.get('retry-after')).toMatch(/^\d+$/u);
		expect((await preview(token, '198.51.100.9')).status).toBe(200);
	});
});

describe('accepting', () => {
	it('a user without a household joins as member; the invitation is used up', async () => {
		const { id, token } = await createInvitation();
		const response = await accept(NEWCOMER, token);

		expect(response.status).toBe(200);
		expect(acceptInvitationResultSchema.parse(await response.json())).toEqual({
			household: { id: FAMILY, name: 'Семья', role: 'member' },
			ok: true
		});
		expect(membershipOf(NEWCOMER)).toEqual({ household_id: FAMILY, role: 'member' });
		expect(invitationRow(id)).toMatchObject({ accepted_at: harness.clock.now.getTime(), accepted_by_user_id: NEWCOMER });

		const household = await harness.call('/api/household', { token: tokens[NEWCOMER] });

		expect(await household.json()).toMatchObject({ household: { id: FAMILY, role: 'member' } });
	});

	it('is one-time: a second acceptance gets the same answer as an unknown token and changes nothing', async () => {
		const { token } = await createInvitation();

		await accept(NEWCOMER, token);

		const before = snapshot();
		const second = await accept(SECOND_NEWCOMER, token);
		const unknown = await accept(SECOND_NEWCOMER, UNKNOWN_TOKEN);

		expect(second.status).toBe(404);
		expect(`${second.status} ${await second.text()}`).toBe(`${unknown.status} ${await unknown.text()}`);
		expect(membershipOf(SECOND_NEWCOMER)).toBeUndefined();
		expect(snapshot()).toBe(before);
	});

	it('of two parallel acceptances of one token exactly one joins', async () => {
		const { token } = await createInvitation();
		const answers = await Promise.all([accept(NEWCOMER, token), accept(SECOND_NEWCOMER, token)]);

		expect(answers.map((answer) => answer.status).sort()).toEqual([200, 404]);
		expect(connection.prepare('SELECT count(*) AS count FROM household_members WHERE user_id IN (?, ?)').get(NEWCOMER, SECOND_NEWCOMER))
			.toEqual({ count: 1 });
	});

	it('always joins the household of the invitation: a household id in the body is ignored', async () => {
		const { token } = await createInvitation();
		const response = await accept(NEWCOMER, token, { householdId: OTHER, role: 'owner' });

		expect(response.status).toBe(200);
		expect(membershipOf(NEWCOMER)).toEqual({ household_id: FAMILY, role: 'member' });
	});

	it('a member of the invited household gets 409; the invitation stays active', async () => {
		const { id, token } = await createInvitation();
		const before = snapshot();

		for (const userId of [MEMBER, OWNER]) {
			const response = await accept(userId, token);

			expect(response.status).toBe(409);
			expect(await response.json()).toMatchObject({ currentHousehold: { name: 'Семья' }, errorCode: 'already-in-household' });
		}

		expect(snapshot()).toBe(before);
		expect(invitationRow(id).accepted_at).toBeNull();
	});

	it('the only member of an empty household cannot «replace» it with its own invitation', async () => {
		const { id, token } = await createInvitation(SOLO);
		const before = snapshot();
		const response = await accept(SOLO, token, { replaceEmptyHousehold: true });

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ currentHousehold: { name: 'Пустое' }, errorCode: 'already-in-household' });
		expect(snapshot()).toBe(before);
		expect(invitationRow(id).accepted_at).toBeNull();
	});

	it('an invitation of one household cannot move the owner of another household with data', async () => {
		const { id, token } = await createInvitation();
		const before = snapshot();

		for (const replaceEmptyHousehold of [false, true]) {
			const response = await accept(OTHER_OWNER, token, { replaceEmptyHousehold });
			const body = await response.json();

			expect(response.status).toBe(409);
			// Only the caller's own household is named, never the invited one.
			expect(body).toMatchObject({ currentHousehold: { name: 'Чужие' }, errorCode: 'already-in-household' });
			expect(JSON.stringify(body)).not.toContain('Семья');
		}

		expect(snapshot()).toBe(before);
		expect(membershipOf(OTHER_OWNER)).toEqual({ household_id: OTHER, role: 'owner' });
		expect(invitationRow(id).accepted_at).toBeNull();
	});

	it('the only member of an empty household is warned first and loses that household only after agreeing', async () => {
		const { token } = await createInvitation();
		const before = snapshot();
		const warned = await accept(SOLO, token);

		expect(warned.status).toBe(409);
		expect(await warned.json()).toMatchObject({
			currentHousehold: { name: 'Пустое' },
			errorCode: 'empty-household-confirmation-required'
		});
		expect(snapshot()).toBe(before);

		const soloInvitation = connection.prepare('SELECT count(*) AS count FROM household_invitations WHERE household_id = ?');
		const joined = await accept(SOLO, token, { replaceEmptyHousehold: true });

		expect(joined.status).toBe(200);
		expect(membershipOf(SOLO)).toEqual({ household_id: FAMILY, role: 'member' });
		expect(await database.select().from(households).where(eq(households.id, SOLO_HOUSEHOLD))).toEqual([]);
		expect(soloInvitation.get(SOLO_HOUSEHOLD)).toEqual({ count: 0 });
	});

	it('an own household with data or with another member is never deleted, even when agreed', async () => {
		const { token } = await createInvitation();

		insertCategory(SOLO_HOUSEHOLD, SOLO);

		const withData = await accept(SOLO, token, { replaceEmptyHousehold: true });

		expect(withData.status).toBe(409);
		expect(await withData.json()).toMatchObject({ errorCode: 'already-in-household' });

		connection.prepare('DELETE FROM categories WHERE household_id = ?').run(SOLO_HOUSEHOLD);
		await database.insert(householdMembers)
			.values({ householdId: SOLO_HOUSEHOLD, joinedAt: new Date(), role: 'member', userId: NEWCOMER });

		const withMember = await accept(SOLO, token, { replaceEmptyHousehold: true });

		expect(withMember.status).toBe(409);
		expect(membershipOf(SOLO)).toEqual({ household_id: SOLO_HOUSEHOLD, role: 'owner' });
		expect(await database.select().from(households).where(eq(households.id, SOLO_HOUSEHOLD))).toHaveLength(1);
	});

	it('needs a browser session and the own origin', async () => {
		const { id, token } = await createInvitation();

		expect((await harness.call('/api/invitations/accept', { body: { token } })).status).toBe(401);
		const foreign = await harness.call('/api/invitations/accept', {
			body: { token },
			origin: 'https://evil.example',
			token: tokens[NEWCOMER]
		});

		expect(foreign.status).toBe(403);
		expect(invitationRow(id).accepted_at).toBeNull();
	});

	it('is limited to 10 per 5 minutes per user', async () => {
		for (let index = 0; index < 10; index += 1) {
			expect((await accept(NEWCOMER, UNKNOWN_TOKEN)).status).toBe(404);
		}

		const { token } = await createInvitation();
		const limited = await accept(NEWCOMER, token);

		expect(limited.status).toBe(429);
		expect(membershipOf(NEWCOMER)).toBeUndefined();
		expect((await accept(SECOND_NEWCOMER, token)).status).toBe(200);
	});

	it('never writes the token to the console', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
			.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
		const { token } = await createInvitation();

		await preview(token);
		await accept(OTHER_OWNER, token);
		await accept(NEWCOMER, token);
		await accept(SECOND_NEWCOMER, token);
		await preview(token);

		const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));

		expect(logged).not.toContain(token);
	});
});

describe('HouseholdInvitationRepository conditions on their own', () => {
	const now = new Date('2026-10-18T10:00:00.000Z');

	function insertInvitation(id: string, tokenHash: string, createdBy = OWNER) {
		connection.prepare(`INSERT INTO household_invitations (id, household_id, token_hash, created_by_user_id, expires_at, created_at)
			VALUES (?, ?, ?, ?, ?, ?)`).run(id, FAMILY, tokenHash, createdBy, now.getTime() + DAY, now.getTime());
	}

	it('a statement that changes no invitation rolls the acceptance back (changes === 1)', () => {
		const repository = new HouseholdInvitationRepository(database);

		insertInvitation('raced', 'raced-hash');
		// Another acceptance «wins» between the read and the update: the update of this one changes no row.
		connection.exec(`CREATE TRIGGER lose_the_race BEFORE UPDATE ON household_invitations
			BEGIN SELECT RAISE(IGNORE); END`);

		expect(repository.accept({ now, replaceEmptyHousehold: false, tokenHash: 'raced-hash', userId: NEWCOMER }))
			.toEqual({ kind: 'unavailable' });
		expect(membershipOf(NEWCOMER)).toBeUndefined();
	});

	it('the empty household is deleted only by statements that find it still empty', () => {
		const repository = new HouseholdInvitationRepository(database);

		insertInvitation('replace', 'replace-hash');
		// Data appears in the empty household between the check and the delete.
		connection.exec(`CREATE TRIGGER data_arrives AFTER UPDATE ON household_invitations
			BEGIN INSERT INTO categories (id, household_id, name, normalized_name, color, created_by_user_id, created_at, updated_at)
			VALUES ('late', '${SOLO_HOUSEHOLD}', 'late', 'late', '#000000', '${SOLO}', 0, 0); END`);

		expect(repository.accept({ now, replaceEmptyHousehold: true, tokenHash: 'replace-hash', userId: SOLO }))
			.toEqual({ currentHouseholdName: 'Пустое', kind: 'already-in-household' });
		expect(membershipOf(SOLO)).toEqual({ household_id: SOLO_HOUSEHOLD, role: 'owner' });
		expect(invitationRow('replace').accepted_at).toBeNull();
		expect(connection.prepare('SELECT count(*) AS count FROM categories WHERE id = \'late\'').get()).toEqual({ count: 0 });
	});

	it('a membership created in parallel stops the acceptance through the unique index', () => {
		const repository = new HouseholdInvitationRepository(database);

		insertInvitation('parallel', 'parallel-hash');
		connection.exec(`CREATE TRIGGER joined_elsewhere AFTER UPDATE ON household_invitations
			BEGIN INSERT INTO household_members (household_id, user_id, role, joined_at)
			VALUES ('${OTHER}', '${NEWCOMER}', 'member', 0); END`);

		expect(repository.accept({ now, replaceEmptyHousehold: false, tokenHash: 'parallel-hash', userId: NEWCOMER }).kind)
			.toBe('already-in-household');
		expect(invitationRow('parallel').accepted_at).toBeNull();
		expect(membershipOf(NEWCOMER)).toBeUndefined();
	});

	it('creating and revoking need an owner of that household at the moment of the statement', () => {
		const repository = new HouseholdInvitationRepository(database);
		const invitation = { createdAt: now, expiresAt: new Date(now.getTime() + DAY), householdId: FAMILY, tokenHash: 'x' };
		const limits = { maxActive: 3, maxPerDay: 10 };

		expect(repository.create({ ...invitation, createdByUserId: MEMBER, id: 'by-member' }, limits)).toEqual({ kind: 'owner-required' });
		expect(repository.create({ ...invitation, createdByUserId: OTHER_OWNER, id: 'by-stranger' }, limits))
			.toEqual({ kind: 'owner-required' });
		expect(connection.prepare('SELECT count(*) AS count FROM household_invitations').get()).toEqual({ count: 0 });

		insertInvitation('to-revoke', 'to-revoke-hash');
		expect(repository.revoke(FAMILY, 'to-revoke', MEMBER, now)).toBe(false);
		expect(repository.revoke(OTHER, 'to-revoke', OTHER_OWNER, now)).toBe(false);
		expect(repository.revoke(FAMILY, 'to-revoke', OWNER, new Date(now.getTime() + DAY))).toBe(false);
		expect(invitationRow('to-revoke').revoked_at).toBeNull();
		expect(repository.revoke(FAMILY, 'to-revoke', OWNER, now)).toBe(true);
	});

	it('each condition of an active invitation holds on its own', () => {
		const repository = new HouseholdInvitationRepository(database);

		insertInvitation('accepted', 'accepted-hash');
		insertInvitation('revoked', 'revoked-hash');
		insertInvitation('expired', 'expired-hash');
		connection.prepare('UPDATE household_invitations SET accepted_at = 1, accepted_by_user_id = ? WHERE id = \'accepted\'').run(MEMBER);
		connection.prepare('UPDATE household_invitations SET revoked_at = 1 WHERE id = \'revoked\'').run();
		connection.prepare('UPDATE household_invitations SET expires_at = ? WHERE id = \'expired\'').run(now.getTime());

		for (const tokenHash of ['accepted-hash', 'revoked-hash', 'expired-hash', 'unknown-hash']) {
			expect(repository.accept({ now, replaceEmptyHousehold: false, tokenHash, userId: NEWCOMER }), tokenHash)
				.toEqual({ kind: 'unavailable' });
		}

		expect(membershipOf(NEWCOMER)).toBeUndefined();
	});
});

describe('HouseholdInvitationService checks the role itself', () => {
	it('a member never reaches the repository: create, list and revoke answer owner-required', async () => {
		const invitations = {
			accept: vi.fn(),
			create: vi.fn(() => ({ kind: 'created' as const })),
			findActivePreview: vi.fn(),
			listActive: vi.fn(async () => []),
			revoke: vi.fn(() => true)
		};
		const service = new HouseholdInvitationService({
			acceptRateLimiter: { tryConsume: () => ({ allowed: true }) },
			config: { ttlMilliseconds: DEFAULT_INVITATION_TTL },
			householdResolver: { requireForUser: async () => ({ baseCurrency: 'BYN', id: FAMILY, name: 'Семья', role: 'member' }) },
			invitations,
			origin: TEST_ORIGIN,
			previewRateLimiter: { tryConsume: () => ({ allowed: true }) }
		});

		expect(await service.create(MEMBER)).toMatchObject({ errorCode: 'owner-required', ok: false });
		expect(await service.listActive(MEMBER)).toMatchObject({ errorCode: 'owner-required', ok: false });
		expect(await service.revoke(MEMBER, 'any')).toMatchObject({ errorCode: 'owner-required', ok: false });
		expect(invitations.create).not.toHaveBeenCalled();
		expect(invitations.listActive).not.toHaveBeenCalled();
		expect(invitations.revoke).not.toHaveBeenCalled();
	});
});

describe('HOUSEHOLD_INVITATION_TTL_HOURS', () => {
	it('defaults to 7 days and accepts whole hours from 1 to 168 only', () => {
		expect(getHouseholdInvitationConfig({}).ttlMilliseconds).toBe(168 * HOUR);
		expect(getHouseholdInvitationConfig({ HOUSEHOLD_INVITATION_TTL_HOURS: ' ' }).ttlMilliseconds).toBe(168 * HOUR);
		expect(getHouseholdInvitationConfig({ HOUSEHOLD_INVITATION_TTL_HOURS: '1' }).ttlMilliseconds).toBe(HOUR);
		expect(getHouseholdInvitationConfig({ HOUSEHOLD_INVITATION_TTL_HOURS: '168' }).ttlMilliseconds).toBe(168 * HOUR);

		for (const value of ['0', '169', '1.5', '-1', 'abc', '72h']) {
			expect(() => getHouseholdInvitationConfig({ HOUSEHOLD_INVITATION_TTL_HOURS: value }), value).toThrow(RangeError);
		}
	});
});
