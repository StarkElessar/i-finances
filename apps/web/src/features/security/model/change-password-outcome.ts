import { type ChangePasswordInput, changePasswordInputSchema, type ChangePasswordResult } from '@i-finances/contracts';

export type PasswordFieldErrors = {
	currentPassword?: string;
	newPassword?: string;
};

export type PasswordValidation =
	| { fieldErrors: PasswordFieldErrors; ok: false }
	| { input: ChangePasswordInput; ok: true };

/** What the person is told after a change attempt; one entry per state of the password card on `D-Security`. */
export type ChangePasswordOutcome =
	/** 200: the password is changed, the other sessions are ended, the browser already holds the new cookie. */
	| { kind: 'changed'; revokedSessionCount: number }
	/** 400: a field is wrong (the wrong current password, a short or unchanged new one). The person stays signed in. */
	| { fieldErrors: PasswordFieldErrors; kind: 'field-errors'; message: string }
	/** 429: too many attempts. Nothing is retried by itself. */
	| { kind: 'rate-limited'; message: string }
	/** 409: the account has no password (it was created through Telegram); there is nothing to change. */
	| { kind: 'password-not-set'; message: string }
	| { kind: 'failed'; message: string };

const FIELD_NAMES = ['currentPassword', 'newPassword'] as const;

function pickFieldErrors(source: Record<string, string> | undefined): PasswordFieldErrors {
	const fieldErrors: PasswordFieldErrors = {};

	for (const name of FIELD_NAMES) {
		const message = source?.[name];

		if (message !== undefined) {
			fieldErrors[name] = message;
		}
	}

	return fieldErrors;
}

/** The same rules as the server (`changePasswordInputSchema`), so a short password never needs a round trip. */
export function validateChangePassword(currentPassword: string, newPassword: string): PasswordValidation {
	const parsed = changePasswordInputSchema.safeParse({ currentPassword, newPassword });

	if (parsed.success) {
		return { input: parsed.data, ok: true };
	}

	const fieldErrors: PasswordFieldErrors = {};

	for (const issue of parsed.error.issues) {
		const name = issue.path[0];

		if ((name === 'currentPassword' || name === 'newPassword') && fieldErrors[name] === undefined) {
			fieldErrors[name] = issue.message;
		}
	}

	return { fieldErrors, ok: false };
}

export function describeChangePasswordResult(result: ChangePasswordResult): ChangePasswordOutcome {
	if (result.ok) {
		return { kind: 'changed', revokedSessionCount: result.revokedSessionCount };
	}

	switch (result.errorCode) {
		case 'invalid-current-password':
		case 'invalid-input':
		case 'password-unchanged':
			return { fieldErrors: pickFieldErrors(result.fieldErrors), kind: 'field-errors', message: result.message };

		case 'rate-limited':
			return { kind: 'rate-limited', message: result.message };

		case 'password-not-set':
			return { kind: 'password-not-set', message: result.message };

		default:
			return { kind: 'failed', message: result.message };
	}
}

/** «Завершено других сеансов: 2.» */
export function formatRevokedSessions(count: number): string {
	return `Завершено других сеансов: ${count}.`;
}
