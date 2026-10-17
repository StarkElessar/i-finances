import {
	changePasswordInputSchema,
	type ChangePasswordResult,
	collectFieldErrors,
	type DeleteSecurityPasskeyResult,
	type RevokeOtherSecuritySessionsResult,
	type RevokeSecuritySessionResult,
	type SecurityErrorCode,
	securityErrorMessageByCode,
	type SecurityFailure,
	type SecurityPasskeysResult,
	type SecuritySessionsResult
} from '@i-finances/contracts';

import { hasUsablePassword } from './has-usable-password';
import { parseUserAgent } from './parse-user-agent';
import type { PasswordService } from './password-service';
import type { LoginRateLimitPort } from './password-sign-in-service';
import type { PasswordUserRepository } from './password-user-repository';
import type { SessionRepository } from './session-repository';
import { generateSessionToken, hashSessionToken } from './session-service';
import type { WebAuthnCredentialRepository } from './webauthn-credential-repository';

export type SecurityServiceDependencies = {
	createToken?: () => string;
	credentialRepository: Pick<WebAuthnCredentialRepository, 'deleteForUser' | 'findByUserId'>;
	now?: () => Date;
	passwordService: Pick<PasswordService, 'hash' | 'verify'>;
	/** Counts wrong «current password» attempts per user, not per address. */
	rateLimiter: LoginRateLimitPort;
	sessionRepository: Pick<SessionRepository, 'deleteForUser' | 'deleteOthersForUser' | 'findActiveByUserId'>;
	userRepository: Pick<PasswordUserRepository, 'findById' | 'replacePasswordAndRevokeOtherSessions'>;
};

/** The new secret of the caller's session after a password change; the controller turns it into a cookie. */
export type RotatedSession = {
	expiresAt: Date;
	token: string;
};

export type ChangePasswordOutcome = {
	result: ChangePasswordResult;
	/** Present only on success, when the current session received a new token and the old one no longer works. */
	rotatedSession?: RotatedSession;
};

/**
 * The signed-in user acting on their own account. `userId` always comes from
 * the resolved session, never from the request, so every query is scoped to it.
 */
export type SecurityActor = {
	sessionId: string;
	userId: string;
};

function failure(errorCode: SecurityErrorCode, fieldErrors?: Record<string, string>): SecurityFailure {
	return {
		errorCode,
		fieldErrors,
		message: securityErrorMessageByCode[errorCode],
		ok: false
	};
}

/**
 * Application service of the «Безопасность» section.
 */
export class SecurityService {
	private readonly createToken: () => string;
	private readonly now: () => Date;

	public constructor(private readonly dependencies: SecurityServiceDependencies) {
		this.createToken = dependencies.createToken ?? generateSessionToken;
		this.now = dependencies.now ?? (() => new Date());
	}

	public async listPasskeys(actor: SecurityActor): Promise<SecurityPasskeysResult> {
		const credentials = await this.dependencies.credentialRepository.findByUserId(actor.userId);

		return {
			ok: true,
			passkeys: credentials
				.toSorted((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
				.map((credential) => ({
					createdAt: credential.createdAt.toISOString(),
					deviceName: credential.deviceName,
					id: credential.id,
					lastUsedAt: credential.lastUsedAt?.toISOString() ?? null
				}))
		};
	}

	/**
	 * Removes one of the user's passkeys.
	 *
	 * Rule: the last passkey can only be removed when the account has a usable
	 * password to fall back to. Otherwise the user would lock themselves out, so
	 * the request is refused with `last-passkey`. The check runs inside the
	 * delete statement itself (see `WebAuthnCredentialRepository.deleteForUser`).
	 */
	public async deletePasskey(actor: SecurityActor, credentialId: string): Promise<DeleteSecurityPasskeyResult> {
		const user = await this.dependencies.userRepository.findById(actor.userId);

		if (user === undefined || !user.isActive) {
			return failure('unauthenticated');
		}

		const deleted = await this.dependencies.credentialRepository.deleteForUser({
			allowLast: hasUsablePassword(user.passwordHash),
			id: credentialId,
			userId: actor.userId
		});

		if (deleted) {
			return { ok: true };
		}

		// Nothing was deleted: either the key is not theirs (or does not exist),
		// or it is their last one and they have no password. Only the caller's own
		// keys are inspected here, so a foreign id is always reported as not found.
		const ownCredentials = await this.dependencies.credentialRepository.findByUserId(actor.userId);

		return ownCredentials.some((credential) => credential.id === credentialId)
			? failure('last-passkey')
			: failure('not-found');
	}

	/**
	 * Changes the password after verifying the current one, then ends every other
	 * session of the user. The session that made the request stays signed in, but
	 * gets a new token (same row, same id), so a stolen cookie of it stops working.
	 */
	public async changePassword(actor: SecurityActor, input: unknown): Promise<ChangePasswordOutcome> {
		const parsedInput = changePasswordInputSchema.safeParse(input);

		if (!parsedInput.success) {
			return { result: failure('invalid-input', collectFieldErrors(parsedInput.error)) };
		}

		const user = await this.dependencies.userRepository.findById(actor.userId);

		if (user === undefined || !user.isActive) {
			return { result: failure('unauthenticated') };
		}

		// No password to change: this is not a failed guess, so it is neither counted
		// nor reported as a wrong password. Argon2 would throw on a placeholder hash.
		if (!hasUsablePassword(user.passwordHash)) {
			return { result: failure('password-not-set') };
		}

		const rateLimitInput = { username: user.id };

		// The attempt is reserved BEFORE the (slow, async) verification and released
		// on success. Check and reservation run in the same tick, so parallel requests
		// cannot all pass the check and guess the password at once.
		if (!this.dependencies.rateLimiter.tryReserve(rateLimitInput).allowed) {
			return { result: failure('rate-limited') };
		}

		const { currentPassword, newPassword } = parsedInput.data;
		const isCurrentPasswordValid = await this.dependencies.passwordService.verify(user.passwordHash, currentPassword);

		if (!isCurrentPasswordValid) {
			return {
				result: failure('invalid-current-password', {
					currentPassword: securityErrorMessageByCode['invalid-current-password']
				})
			};
		}

		this.dependencies.rateLimiter.recordSuccess(rateLimitInput);

		if (newPassword === currentPassword) {
			return {
				result: failure('password-unchanged', {
					newPassword: securityErrorMessageByCode['password-unchanged']
				})
			};
		}

		const rotatedToken = this.createToken();
		const replacement = this.dependencies.userRepository.replacePasswordAndRevokeOtherSessions({
			expectedPasswordHash: user.passwordHash,
			keepSessionId: actor.sessionId,
			newPasswordHash: await this.dependencies.passwordService.hash(newPassword),
			now: this.now(),
			rotatedTokenHash: hashSessionToken(rotatedToken),
			userId: user.id
		});

		if (replacement === undefined) {
			// The password was changed by a parallel request after we verified it.
			return {
				result: failure('invalid-current-password', {
					currentPassword: securityErrorMessageByCode['invalid-current-password']
				})
			};
		}

		return {
			result: { ok: true, revokedSessionCount: replacement.revokedSessionCount },
			rotatedSession: replacement.rotatedSession === undefined
				? undefined
				: { expiresAt: replacement.rotatedSession.expiresAt, token: rotatedToken }
		};
	}

	public async listSessions(actor: SecurityActor): Promise<SecuritySessionsResult> {
		const records = await this.dependencies.sessionRepository.findActiveByUserId(actor.userId, this.now());

		return {
			ok: true,
			sessions: records.map((record) => {
				const { browser, os } = parseUserAgent(record.userAgent);

				return {
					browser,
					createdAt: record.createdAt.toISOString(),
					expiresAt: record.expiresAt.toISOString(),
					id: record.id,
					ipAddress: record.ipAddress,
					isCurrent: record.id === actor.sessionId,
					lastSeenAt: record.lastSeenAt.toISOString(),
					os,
					userAgent: record.userAgent
				};
			})
		};
	}

	/**
	 * Ends one of the user's other sessions. The current session cannot be ended
	 * here: that is what sign-out is for, and ending it by accident would drop
	 * the very request the user is making.
	 */
	public async revokeSession(actor: SecurityActor, sessionId: string): Promise<RevokeSecuritySessionResult> {
		if (sessionId === actor.sessionId) {
			return failure('current-session');
		}

		const deleted = await this.dependencies.sessionRepository.deleteForUser(actor.userId, sessionId);

		return deleted ? { ok: true } : failure('not-found');
	}

	public async revokeOtherSessions(actor: SecurityActor): Promise<RevokeOtherSecuritySessionsResult> {
		const revokedSessionCount = await this.dependencies.sessionRepository.deleteOthersForUser(
			actor.userId,
			actor.sessionId
		);

		return { ok: true, revokedSessionCount };
	}
}
