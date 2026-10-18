import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { householdMembers, sessions } from '@/infrastructure/database/schema';
import { SessionRepository } from '@/modules/auth';
import { HouseholdMembershipRepository } from '@/modules/household';

import { householdLeaveResultSchema, householdResultSchema } from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHouseholdTestApp, insertHousehold, insertUser } from './support/household-test-app';

/**
 * A7: members of a household (Р6, Р7, flow 5.5) over HTTP with real cookie sessions: removal by the owner ends every
 * session of the removed member in the same transaction, leaving keeps the session, a household always has an owner.
 */

const OWNER = 'owner';

const MEMBER = 'member';

const OTHER_OWNER = 'other-owner';

const FAMILY = 'family-household';

const OTHER = 'other-household';

let connection: Database.Database;

let database: AppDatabase;

let harness: ReturnType<typeof createHouseholdTestApp>;

const tokens: Record<string, string> = {};

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });

	for (const [id, name] of [[OWNER, 'Сергей'], [MEMBER, 'Анна'], [OTHER_OWNER, 'Борис']]) {
		await insertUser(database, id, name);
	}

	await insertHousehold(database, FAMILY, 'Семья', [{ role: 'owner', userId: OWNER }, { role: 'member', userId: MEMBER }]);
	await insertHousehold(database, OTHER, 'Чужие', [{ role: 'owner', userId: OTHER_OWNER }]);
	// Authorship of the member in the household data: it must survive the removal (users are never deleted).
	connection.prepare(`INSERT INTO categories (id, household_id, name, normalized_name, color, created_by_user_id, created_at, updated_at)
		VALUES ('member-category', ?, 'Кафе', 'кафе', '#3f77a8', ?, 0, 0)`).run(FAMILY, MEMBER);

	harness = createHouseholdTestApp(database);

	for (const userId of [OWNER, MEMBER, OTHER_OWNER]) {
		tokens[userId] = await harness.signIn(userId);
	}
});

afterEach(() => {
	connection.close();
});

function remove(userId: string, actor = OWNER) {
	return harness.call(`/api/household/members/${userId}/remove`, { method: 'POST', token: tokens[actor] });
}

function leave(actor: string) {
	return harness.call('/api/household/leave', { method: 'POST', token: tokens[actor] });
}

function sessionCount(userId: string): number {
	return (connection.prepare('SELECT count(*) AS count FROM sessions WHERE user_id = ?').get(userId) as { count: number }).count;
}

function membershipOf(userId: string) {
	return connection.prepare('SELECT household_id, role FROM household_members WHERE user_id = ?').get(userId);
}

function snapshot(): string {
	return JSON.stringify(['household_members', 'households', 'sessions', 'users', 'categories', 'household_invitations']
		.map((table) => connection.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()));
}

describe('removing a member', () => {
	it('removes the membership and every session of the member at once; the user and their data stay', async () => {
		const secondDevice = await harness.signIn(MEMBER);

		expect(sessionCount(MEMBER)).toBe(2);

		const response = await remove(MEMBER);
		const body = householdResultSchema.parse(await response.json());

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ household: { id: FAMILY, members: [{ role: 'owner', userId: OWNER }], role: 'owner' }, ok: true });
		expect(membershipOf(MEMBER)).toBeUndefined();
		expect(sessionCount(MEMBER)).toBe(0);
		expect(sessionCount(OWNER)).toBe(1);
		expect(connection.prepare('SELECT id FROM users WHERE id = ?').get(MEMBER)).toEqual({ id: MEMBER });
		expect(connection.prepare('SELECT created_by_user_id FROM categories WHERE id = \'member-category\'').get())
			.toEqual({ created_by_user_id: MEMBER });

		// The old cookies are dead on every device: 401, not even household-required.
		for (const token of [tokens[MEMBER], secondDevice]) {
			const after = await harness.call('/api/household', { token });

			expect(after.status).toBe(401);
		}
	});

	it('the member signs in again and is in onboarding', async () => {
		await remove(MEMBER);

		const fresh = await harness.signIn(MEMBER);
		const response = await harness.call('/api/household', { token: fresh });

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ errorCode: 'household-required' });
	});

	it('only the owner removes: a member gets 403 and nothing changes', async () => {
		const before = snapshot();

		for (const target of [OWNER, MEMBER, OTHER_OWNER, 'nobody']) {
			const response = await remove(target, MEMBER);

			expect(response.status, target).toBe(403);
			expect(await response.json()).toMatchObject({ errorCode: 'owner-required' });
		}

		expect(snapshot()).toBe(before);
	});

	it('the owner cannot remove themselves', async () => {
		const before = snapshot();
		const response = await remove(OWNER);

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ errorCode: 'cannot-remove-self' });
		expect(snapshot()).toBe(before);
	});

	it('a member of another household and an unknown user are answered alike, and nothing changes', async () => {
		const before = snapshot();
		const foreign = await remove(MEMBER, OTHER_OWNER);
		const foreignOwner = await remove(OWNER, OTHER_OWNER);
		const unknown = await remove('nobody', OTHER_OWNER);
		const texts = await Promise.all([foreign, foreignOwner, unknown].map((answer) => answer.text()));

		expect([foreign.status, foreignOwner.status, unknown.status]).toEqual([404, 404, 404]);
		expect(new Set(texts).size).toBe(1);
		expect(JSON.parse(texts[0])).toMatchObject({ errorCode: 'member-not-found' });
		expect(snapshot()).toBe(before);
	});

	it('the MCP-style bearer or no session gets 401, another origin 403', async () => {
		const before = snapshot();

		expect((await harness.call(`/api/household/members/${MEMBER}/remove`, { method: 'POST' })).status).toBe(401);
		expect((await harness.call(`/api/household/members/${MEMBER}/remove`, {
			headers: { authorization: 'Bearer anything' },
			method: 'POST'
		})).status).toBe(401);
		expect((await harness.call(`/api/household/members/${MEMBER}/remove`, {
			method: 'POST',
			origin: 'https://evil.example',
			token: tokens[OWNER]
		})).status).toBe(403);
		expect(snapshot()).toBe(before);
	});

	it('removing a second owner revokes the invitations they created, so they cannot come back with one', async () => {
		connection.prepare('UPDATE household_members SET role = \'owner\' WHERE user_id = ?').run(MEMBER);

		const created = await harness.call('/api/household/invitations', { method: 'POST', token: tokens[MEMBER] });
		const own = await harness.call('/api/household/invitations', { method: 'POST', token: tokens[OWNER] });
		const { invitation } = await created.json() as { invitation: { id: string; link: string } };
		const { invitation: ownInvitation } = await own.json() as { invitation: { id: string } };

		expect((await remove(MEMBER)).status).toBe(200);
		expect(connection.prepare('SELECT revoked_at FROM household_invitations WHERE id = ?').get(invitation.id))
			.toEqual({ revoked_at: harness.clock.now.getTime() });
		expect(connection.prepare('SELECT revoked_at FROM household_invitations WHERE id = ?').get(ownInvitation.id))
			.toEqual({ revoked_at: null });

		const back = await harness.call('/api/invitations/accept', {
			body: { token: invitation.link.split('/').at(-1) },
			token: await harness.signIn(MEMBER)
		});

		expect(back.status).toBe(404);
		expect(membershipOf(MEMBER)).toBeUndefined();
	});
});

describe('leaving a household', () => {
	it('a member leaves, keeps the session and is in onboarding', async () => {
		const response = await leave(MEMBER);

		expect(response.status).toBe(200);
		expect(householdLeaveResultSchema.parse(await response.json())).toEqual({ ok: true });
		expect(membershipOf(MEMBER)).toBeUndefined();
		expect(sessionCount(MEMBER)).toBe(1);

		const after = await harness.call('/api/household', { token: tokens[MEMBER] });

		expect(after.status).toBe(403);
		expect(await after.json()).toMatchObject({ errorCode: 'household-required' });

		const created = await harness.call('/api/household', { body: { name: 'Своё' }, token: tokens[MEMBER] });

		expect(created.status).toBe(201);
	});

	it('the last owner cannot leave, even alone in the household', async () => {
		const before = snapshot();

		for (const owner of [OWNER, OTHER_OWNER]) {
			const response = await leave(owner);

			expect(response.status, owner).toBe(409);
			expect(await response.json()).toMatchObject({ errorCode: 'last-owner' });
		}

		expect(snapshot()).toBe(before);
	});

	it('an owner leaves while another owner remains, and then the remaining one cannot', async () => {
		connection.prepare('UPDATE household_members SET role = \'owner\' WHERE user_id = ?').run(MEMBER);

		expect((await leave(OWNER)).status).toBe(200);
		expect((await leave(MEMBER)).status).toBe(409);
		expect(membershipOf(MEMBER)).toEqual({ household_id: FAMILY, role: 'owner' });
	});

	it('without a household: household-required; without a session: 401', async () => {
		await leave(MEMBER);

		expect((await leave(MEMBER)).status).toBe(403);
		expect((await harness.call('/api/household/leave', { method: 'POST' })).status).toBe(401);
	});
});

describe('HouseholdMembershipRepository conditions on their own', () => {
	const now = new Date('2026-10-18T10:00:00.000Z');

	function repository() {
		return new HouseholdMembershipRepository(database, new SessionRepository(database));
	}

	it('removes only while the remover is an owner of that household and not the one removed', () => {
		const before = snapshot();

		expect(repository().removeMember({ householdId: FAMILY, memberUserId: OWNER, now, ownerUserId: MEMBER }))
			.toEqual({ kind: 'not-removed' });
		expect(repository().removeMember({ householdId: FAMILY, memberUserId: OWNER, now, ownerUserId: OWNER }))
			.toEqual({ kind: 'not-removed' });
		expect(repository().removeMember({ householdId: FAMILY, memberUserId: MEMBER, now, ownerUserId: OTHER_OWNER }))
			.toEqual({ kind: 'not-removed' });
		expect(repository().removeMember({ householdId: OTHER, memberUserId: MEMBER, now, ownerUserId: OTHER_OWNER }))
			.toEqual({ kind: 'not-removed' });
		expect(snapshot()).toBe(before);
	});

	it('two owners removing each other: only the first succeeds, an owner always remains', () => {
		connection.prepare('UPDATE household_members SET role = \'owner\' WHERE user_id = ?').run(MEMBER);

		expect(repository().removeMember({ householdId: FAMILY, memberUserId: MEMBER, now, ownerUserId: OWNER }).kind).toBe('removed');
		expect(repository().removeMember({ householdId: FAMILY, memberUserId: OWNER, now, ownerUserId: MEMBER }).kind).toBe('not-removed');
		expect(membershipOf(OWNER)).toEqual({ household_id: FAMILY, role: 'owner' });
	});

	it('the last owner is not deleted by leave, whatever the caller checked before', () => {
		expect(repository().leave({ householdId: FAMILY, now, userId: OWNER })).toEqual({ kind: 'not-left' });
		expect(repository().leave({ householdId: OTHER, now, userId: OTHER_OWNER })).toEqual({ kind: 'not-left' });
		expect(membershipOf(OWNER)).toEqual({ household_id: FAMILY, role: 'owner' });
	});

	it('the sessions are ended in the same transaction: a failure after them rolls the removal back', async () => {
		// The session delete fails: the membership must still be there afterwards.
		connection.exec(`CREATE TRIGGER sessions_refuse BEFORE DELETE ON sessions
			BEGIN SELECT RAISE(ABORT, 'refused'); END`);

		expect(() => repository().removeMember({ householdId: FAMILY, memberUserId: MEMBER, now, ownerUserId: OWNER })).toThrow();
		expect(membershipOf(MEMBER)).toEqual({ household_id: FAMILY, role: 'member' });
		expect(await database.select().from(sessions).where(eq(sessions.userId, MEMBER))).toHaveLength(1);
		expect(await database.select().from(householdMembers).where(eq(householdMembers.householdId, FAMILY))).toHaveLength(2);
	});
});
