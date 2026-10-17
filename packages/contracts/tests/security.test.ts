import { describe, expect, it } from 'vitest';

import {
	changePasswordInputSchema,
	securityErrorCodes,
	securityErrorMessageByCode,
	securityPasskeysResultSchema,
	securitySessionsResultSchema
} from '../src/security';

describe('security contracts', () => {
	it('requires a current password and a new password of at least 12 characters', () => {
		expect(changePasswordInputSchema.safeParse({
			currentPassword: 'old-password',
			newPassword: 'a-long-enough-password'
		}).success).toBe(true);
		expect(changePasswordInputSchema.safeParse({
			currentPassword: '',
			newPassword: 'a-long-enough-password'
		}).success).toBe(false);
		expect(changePasswordInputSchema.safeParse({
			currentPassword: 'old-password',
			newPassword: 'short'
		}).success).toBe(false);
	});

	it('has a message for every error code', () => {
		for (const code of securityErrorCodes) {
			expect(securityErrorMessageByCode[code].length).toBeGreaterThan(0);
		}
	});

	it('parses passkey and session lists', () => {
		const passkeys = {
			ok: true,
			passkeys: [{
				createdAt: '2026-07-24T10:00:00.000Z',
				deviceName: null,
				id: 'credential-1',
				lastUsedAt: null
			}]
		};

		expect(securityPasskeysResultSchema.parse(passkeys)).toEqual(passkeys);
		expect(securitySessionsResultSchema.safeParse({
			ok: true,
			sessions: [{
				browser: 'Chrome',
				createdAt: '2026-07-24T10:00:00.000Z',
				expiresAt: '2026-08-24T10:00:00.000Z',
				id: 'session-1',
				ipAddress: null,
				isCurrent: true,
				lastSeenAt: '2026-07-24T10:00:00.000Z',
				os: null,
				userAgent: null
			}]
		}).success).toBe(true);
	});
});
