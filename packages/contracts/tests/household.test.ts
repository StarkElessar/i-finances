import { describe, expect, it } from 'vitest';

import {
	appInvitationErrorCodes,
	appInvitationErrorMessageByCode,
	appInvitationListItemSchema,
	createAppInvitationInputSchema
} from '../src/app-invitation';
import { currentSessionResponseSchema } from '../src/auth';
import {
	createHouseholdInputSchema,
	HOUSEHOLD_NAME_MAX_LENGTH,
	HOUSEHOLD_REQUIRED_ERROR_CODE,
	householdErrorCodes,
	householdErrorMessageByCode,
	householdLeaveResultSchema,
	householdResultSchema,
	isHouseholdRequiredFailure,
	updateHouseholdInputSchema
} from '../src/household';
import {
	acceptInvitationInputSchema,
	acceptInvitationResultSchema,
	householdInvitationErrorCodes,
	householdInvitationErrorMessageByCode,
	householdInvitationFailureSchema,
	householdInvitationUnavailableReasons,
	invitationPreviewResultSchema,
	invitationPreviewSchema,
	invitationTokenSchema,
	readInvitationTokenFromLocation
} from '../src/household-invitation';
import { telegramSignInStartInputSchema } from '../src/telegram-auth';

/**
 * The invitation contracts (A6, `household-invitation.ts`) are tested here too: the lint default project of the
 * contracts tests is capped at 8 files.
 */
const TOKEN = 'A'.repeat(21) + '-_' + 'z'.repeat(20);

describe('household contracts', () => {
	it('trims the household name and rejects an empty or too long one', () => {
		expect(createHouseholdInputSchema.parse({ name: '  Семья  ' })).toEqual({ name: 'Семья' });
		expect(createHouseholdInputSchema.safeParse({ name: '   ' }).success).toBe(false);
		expect(updateHouseholdInputSchema.safeParse({ name: 'x'.repeat(HOUSEHOLD_NAME_MAX_LENGTH) }).success).toBe(true);
		expect(updateHouseholdInputSchema.safeParse({ name: 'x'.repeat(HOUSEHOLD_NAME_MAX_LENGTH + 1) }).success).toBe(false);
	});

	it('has a message for every error code', () => {
		for (const code of householdErrorCodes) {
			expect(householdErrorMessageByCode[code].length).toBeGreaterThan(0);
		}
	});

	it('recognises the shared household-required failure and nothing else', () => {
		expect(isHouseholdRequiredFailure({
			errorCode: HOUSEHOLD_REQUIRED_ERROR_CODE,
			message: 'нет окружения',
			ok: false
		})).toBe(true);
		expect(isHouseholdRequiredFailure({ errorCode: 'forbidden', message: 'нет', ok: false })).toBe(false);
		expect(isHouseholdRequiredFailure(undefined)).toBe(false);
	});

	it('parses household details with members', () => {
		expect(householdResultSchema.safeParse({
			household: {
				baseCurrency: 'BYN',
				id: 'household-1',
				members: [{
					displayName: 'Сергей',
					joinedAt: '2026-10-18T10:00:00.000Z',
					role: 'owner',
					telegramUsername: null,
					userId: 'user-1'
				}],
				name: 'Семья',
				role: 'owner'
			},
			ok: true
		}).success).toBe(true);
	});

	it('requires the household field in an authenticated session, null in onboarding', () => {
		const user = { displayName: 'Сергей', id: 'user-1', username: 'sergei' };
		const methods = { hasPassword: true, telegram: null };

		expect(currentSessionResponseSchema.safeParse({ authenticated: true, household: null, user, ...methods }).success).toBe(true);
		expect(currentSessionResponseSchema.safeParse({
			authenticated: true,
			household: { id: 'household-1', name: 'Семья', role: 'member' },
			user,
			...methods
		}).success).toBe(true);
		expect(currentSessionResponseSchema.safeParse({ authenticated: true, user, ...methods }).success).toBe(false);
	});
});

describe('household invitation contracts', () => {
	it('a token is exactly 43 base64url characters', () => {
		expect(TOKEN).toHaveLength(43);
		expect(invitationTokenSchema.safeParse(TOKEN).success).toBe(true);
		expect(invitationTokenSchema.safeParse(TOKEN.slice(1)).success).toBe(false);
		expect(invitationTokenSchema.safeParse(`${TOKEN}a`).success).toBe(false);
		expect(invitationTokenSchema.safeParse(`${TOKEN.slice(1)}=`).success).toBe(false);
		expect(invitationTokenSchema.safeParse(`${TOKEN.slice(1)}/`).success).toBe(false);
	});

	it('acceptance does not replace an empty household unless asked, and drops unknown fields', () => {
		expect(acceptInvitationInputSchema.parse({ token: TOKEN })).toEqual({ replaceEmptyHousehold: false, token: TOKEN });
		expect(acceptInvitationInputSchema.parse({ householdId: 'other', role: 'owner', token: TOKEN }))
			.toEqual({ replaceEmptyHousehold: false, token: TOKEN });
		expect(acceptInvitationInputSchema.safeParse({ replaceEmptyHousehold: 'yes', token: TOKEN }).success).toBe(false);
	});

	it('reads the token from the fragment of the invitation page only, never from a path', () => {
		const read = (link: string) => readInvitationTokenFromLocation(new URL(link));

		expect(read(`https://finance.example/invite#${TOKEN}`)).toBe(TOKEN);
		expect(read(`https://finance.example/invite/#${TOKEN}`)).toBe(TOKEN);
		expect(readInvitationTokenFromLocation({ hash: `#${TOKEN}`, pathname: '/invite' })).toBe(TOKEN);
		expect(read('https://finance.example/invite')).toBeUndefined();
		expect(read('https://finance.example/invite#short')).toBeUndefined();
		expect(read(`https://finance.example/invite/${TOKEN}`)).toBeUndefined();
		expect(read(`https://finance.example/other#${TOKEN}`)).toBeUndefined();
		expect(read(`https://finance.example/invite?token=${TOKEN}`)).toBeUndefined();
	});

	it('the preview carries the two names and the deadline only', () => {
		const parsed = invitationPreviewResultSchema.parse({
			invitation: { expiresAt: '2026-10-25T10:00:00.000Z', householdId: 'x', householdName: 'Семья', inviterName: 'Сергей' },
			ok: true
		});

		expect(parsed).toEqual({
			invitation: { expiresAt: '2026-10-25T10:00:00.000Z', householdName: 'Семья', inviterName: 'Сергей' },
			ok: true
		});
	});

	it('an unavailable invitation may name one of four reasons; the reason is optional', () => {
		const failure = {
			errorCode: 'invitation-unavailable',
			message: householdInvitationErrorMessageByCode['invitation-unavailable'],
			ok: false
		};

		expect([...householdInvitationUnavailableReasons]).toEqual(['expired', 'used', 'revoked', 'unknown']);

		for (const reason of householdInvitationUnavailableReasons) {
			expect(householdInvitationFailureSchema.parse({ ...failure, reason })).toEqual({ ...failure, reason });
			expect(invitationPreviewResultSchema.parse({ ...failure, reason })).toEqual({ ...failure, reason });
			expect(acceptInvitationResultSchema.parse({ ...failure, reason })).toEqual({ ...failure, reason });
		}

		// Additive: an answer without it (older server, malformed token) is still valid and gains no key.
		expect(householdInvitationFailureSchema.parse(failure)).toEqual(failure);
		expect(householdInvitationFailureSchema.safeParse({ ...failure, reason: 'not-found' }).success).toBe(false);
		expect(householdInvitationFailureSchema.safeParse({ ...failure, reason: 'EXPIRED' }).success).toBe(false);
		expect(householdInvitationFailureSchema.safeParse({ ...failure, reason: null }).success).toBe(false);
	});

	it('has a message for every error code', () => {
		for (const code of householdInvitationErrorCodes) {
			expect(householdInvitationErrorMessageByCode[code].length).toBeGreaterThan(0);
		}

		for (const code of householdErrorCodes) {
			expect(householdErrorMessageByCode[code].length).toBeGreaterThan(0);
		}
	});

	it('leaving answers ok or a household failure', () => {
		expect(householdLeaveResultSchema.safeParse({ ok: true }).success).toBe(true);
		expect(householdLeaveResultSchema.safeParse({ errorCode: 'last-owner', message: 'нет', ok: false }).success).toBe(true);
	});
});

// Invitations into the application (app-invitations-v1.md): the same link, the same preview, a kind.
const APP_TEST_TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_9';

describe('invitations into the application: contracts', () => {
	it('a note is optional, trimmed, at most 80 characters, without control or format characters', () => {
		expect(createAppInvitationInputSchema.parse({})).toEqual({});
		expect(createAppInvitationInputSchema.parse({ note: '  Для Марии ' })).toEqual({ note: 'Для Марии' });
		expect(createAppInvitationInputSchema.parse({ note: 'я'.repeat(80) }).note).toHaveLength(80);

		for (const note of ['я'.repeat(81), 'a\nb', 'a‮b', 'a​b', 5, null]) {
			expect(createAppInvitationInputSchema.safeParse({ note }).success, String(note)).toBe(false);
		}
	});

	it('every error code has a message', () => {
		for (const code of appInvitationErrorCodes) {
			expect(appInvitationErrorMessageByCode[code], code).not.toBe('');
		}

		expect(householdInvitationErrorMessageByCode['app-invitation-not-acceptable']).toMatch(/приглашение в приложение/u);
	});

	it('a list item carries no link, token or hash', () => {
		expect(Object.keys(appInvitationListItemSchema.shape).sort())
			.toEqual(['acceptedAt', 'acceptedBy', 'createdAt', 'expiresAt', 'id', 'note', 'status']);
	});
});

describe('the preview tells the kind', () => {
	it('a household preview has the household name, an application preview has none', () => {
		const expiresAt = '2026-10-29T10:00:00.000Z';

		expect(invitationPreviewSchema.safeParse({ expiresAt, householdName: 'Семья', inviterName: 'Сергей', kind: 'household' }).success)
			.toBe(true);
		expect(invitationPreviewSchema.safeParse({ expiresAt, inviterName: 'Сергей', kind: 'app' }).success).toBe(true);
		// The shape of clients written before the kind: a household invitation.
		expect(invitationPreviewSchema.safeParse({ expiresAt, householdName: 'Семья', inviterName: 'Сергей' }).success).toBe(true);

		for (const preview of [
			{ expiresAt, householdName: 'Семья', inviterName: 'Сергей', kind: 'app' },
			{ expiresAt, inviterName: 'Сергей', kind: 'household' },
			{ expiresAt, inviterName: 'Сергей' },
			{ expiresAt, inviterName: 'Сергей', kind: 'platform' }
		]) {
			expect(invitationPreviewSchema.safeParse(preview).success, JSON.stringify(preview)).toBe(false);
		}

		expect(invitationPreviewResultSchema.safeParse({ invitation: { expiresAt, inviterName: 'Сергей', kind: 'app' }, ok: true }).success)
			.toBe(true);
	});
});

describe('start and session', () => {
	it('start takes an optional invitation token of the invitation format', () => {
		expect(telegramSignInStartInputSchema.parse({})).toEqual({});
		expect(telegramSignInStartInputSchema.parse({ invitationToken: APP_TEST_TOKEN })).toEqual({ invitationToken: APP_TEST_TOKEN });

		for (const invitationToken of ['short', `${APP_TEST_TOKEN}x`, `${APP_TEST_TOKEN.slice(0, 42)}/`, 7]) {
			expect(telegramSignInStartInputSchema.safeParse({ invitationToken }).success, String(invitationToken)).toBe(false);
		}
	});

	it('the session carries isPlatformAdmin', () => {
		const session = {
			authenticated: true,
			hasPassword: true,
			household: null,
			isPlatformAdmin: true,
			telegram: null,
			user: { displayName: 'Сергей', id: 'stark', username: 'stark' }
		};

		expect(currentSessionResponseSchema.parse(session)).toEqual(session);
		expect(currentSessionResponseSchema.safeParse({ ...session, isPlatformAdmin: 'yes' }).success).toBe(false);
	});
});
