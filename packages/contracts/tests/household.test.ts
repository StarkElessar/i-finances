import { describe, expect, it } from 'vitest';

import { currentSessionResponseSchema } from '../src/auth';
import {
	createHouseholdInputSchema,
	HOUSEHOLD_NAME_MAX_LENGTH,
	HOUSEHOLD_REQUIRED_ERROR_CODE,
	householdErrorCodes,
	householdErrorMessageByCode,
	householdResultSchema,
	isHouseholdRequiredFailure,
	updateHouseholdInputSchema
} from '../src/household';

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
