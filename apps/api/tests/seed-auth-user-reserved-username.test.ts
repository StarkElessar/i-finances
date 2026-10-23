import { execFileSync } from 'node:child_process';

import { isReservedUsername } from '@/modules/auth';

import { describe, expect, it } from 'vitest';

/**
 * `tg-<id>` belongs to users who sign up through Telegram (Р3): the manual seed script must refuse it.
 */

describe('isReservedUsername', () => {
	it.each(['tg-1', 'tg-123456789', 'TG-1', '  Tg-7 ', 'tg-'])('reserves %j', (username) => {
		expect(isReservedUsername(username)).toBe(true);
	});

	it.each(['sergei', 'tg', 'tgx-1', 'a-tg-1', 'tg_1', 'stg-1'])('allows %j', (username) => {
		expect(isReservedUsername(username)).toBe(false);
	});
});

describe('seed-auth-user.ts', () => {
	it.each(['tg-1234', 'TG-1234'])('refuses SEED_USERNAME=%s before touching the database', (username) => {
		let failure: { status: number | null; stderr: string } | undefined;

		try {
			execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed-auth-user.ts'], {
				env: {
					...process.env,
					DATABASE_URL: ':memory:',
					SEED_DISPLAY_NAME: 'Test',
					SEED_PASSWORD: 'a-long-enough-password',
					SEED_USERNAME: username
				},
				stdio: 'pipe'
			});
		}
		catch (error: unknown) {
			const { status, stderr } = error as { status: number | null; stderr: Buffer };

			failure = { status, stderr: stderr.toString() };
		}

		expect(failure?.status).toBe(1);
		expect(failure?.stderr).toContain('reserved for users who sign up through Telegram');
		expect(failure?.stderr).not.toContain('a-long-enough-password');
	}, 30_000);
});
