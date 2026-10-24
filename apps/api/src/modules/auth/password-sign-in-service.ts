import {
	type PasswordSignInErrorCode,
	passwordSignInErrorMessageByCode,
	passwordSignInInputSchema,
	type PasswordSignInResult
} from '@i-finances/contracts';
import type { z } from 'zod';

import { DUMMY_PASSWORD_HASH } from './dummy-password-hash';
import { hasUsablePassword } from './has-usable-password';
import type { LoginRateLimiter } from './login-rate-limiter';
import { normalizeUsername } from './normalize-username';
import type { PasswordService } from './password-service';
import type { PasswordUserRepository } from './password-user-repository';
import type { PasswordVerificationLimiter } from './password-verification-limiter';
import type { SessionService } from './session-service';
import { type CreatedSession } from './session-service';
import { validateReturnPath } from './validate-return-path';

export type PasswordSignInMetadata = {
	ipAddress?: string;
	userAgent?: string;
};

export type PasswordSignInOutcome =
	| Extract<PasswordSignInResult, { ok: true }> & { session: CreatedSession }
	| Extract<PasswordSignInResult, { ok: false }> & { retryAfterSeconds?: number };

export type PasswordVerificationPort = Pick<PasswordService, 'verify'>;
export type PasswordUserPort = Pick<PasswordUserRepository, 'findByUsername' | 'insertSessionIfPasswordUnchanged'>;
/** Only drafts the session: `insertSessionIfPasswordUnchanged` stores it under the check that the password still holds. */
export type SessionCreationPort = Pick<SessionService, 'draftSession'>;
export type LoginRateLimitPort = Pick<LoginRateLimiter, 'recordSuccess' | 'tryReserve'>;

export type PasswordSignInServiceDependencies = {
	passwordService: PasswordVerificationPort;
	rateLimiter: LoginRateLimitPort;
	sessionService: SessionCreationPort;
	userRepository: PasswordUserPort;
	verificationLimiter: Pick<PasswordVerificationLimiter, 'acquire'>;
};

export class PasswordSignInService {
	private readonly passwordService: PasswordVerificationPort;
	private readonly rateLimiter: LoginRateLimitPort;
	private readonly sessionService: SessionCreationPort;
	private readonly userRepository: PasswordUserPort;
	private readonly verificationLimiter: Pick<PasswordVerificationLimiter, 'acquire'>;

	public constructor(dependencies: PasswordSignInServiceDependencies) {
		this.passwordService = dependencies.passwordService;
		this.rateLimiter = dependencies.rateLimiter;
		this.sessionService = dependencies.sessionService;
		this.userRepository = dependencies.userRepository;
		this.verificationLimiter = dependencies.verificationLimiter;
	}

	public async signIn(
		input: unknown,
		metadata: PasswordSignInMetadata = {}
	): Promise<PasswordSignInOutcome> {
		const parsedInput = passwordSignInInputSchema.safeParse(input);

		if (!parsedInput.success) {
			return this.failure(
				'invalid-input',
				this.createFieldErrors(parsedInput.error)
			);
		}

		// Admission precedes ALL counter access: overload is not a failed password attempt, even on timeout.
		const admission = await this.verificationLimiter.acquire();

		if (!admission.allowed) {
			return { ...this.failure('rate-limited'), retryAfterSeconds: admission.retryAfterSeconds };
		}

		try {
			return await this.signInAdmitted(parsedInput.data, metadata);
		}
		finally {
			admission.release();
		}
	}

	private async signInAdmitted(
		input: z.infer<typeof passwordSignInInputSchema>,
		metadata: PasswordSignInMetadata
	): Promise<PasswordSignInOutcome> {
		const username = normalizeUsername(input.username);
		const rateLimitInput = {
			ipAddress: metadata.ipAddress,
			username
		};

		// The attempt is counted here, before the slow verification, so parallel requests cannot outrun the limit.
		const reservation = this.rateLimiter.tryReserve(rateLimitInput);

		if (!reservation.allowed) {
			return {
				...this.failure('rate-limited'),
				retryAfterSeconds: reservation.retryAfterSeconds
			};
		}

		const user = await this.userRepository.findByUsername(username);
		// Every attempt costs one Argon2 verification, also for unknown, inactive and password-less accounts,
		// so neither the response time nor the status tells which usernames exist or have a password.
		const storedHash = user?.isActive === true && hasUsablePassword(user.passwordHash) ? user.passwordHash : undefined;
		const isHashMatch = await this.verifyPassword(storedHash ?? DUMMY_PASSWORD_HASH, input.password);

		if (user === undefined || storedHash === undefined || !isHashMatch) {
			return this.failure('invalid-credentials');
		}

		const draft = this.sessionService.draftSession(metadata);
		// The password was right for `storedHash`, read before the slow verification. If a password change or a
		// deactivation committed meanwhile, the old password must not open a session that outlives it.
		const stored = this.userRepository.insertSessionIfPasswordUnchanged({
			expectedPasswordHash: storedHash,
			session: { ...draft.record, userId: user.id }
		});

		if (!stored) {
			return this.failure('invalid-credentials');
		}

		this.rateLimiter.recordSuccess(rateLimitInput);

		return {
			ok: true,
			redirectTo: validateReturnPath(input.returnTo),
			session: draft.session
		};
	}

	private async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
		try {
			return await this.passwordService.verify(passwordHash, password);
		}
		catch (error: unknown) {
			console.error('Password verification failed.', error instanceof Error ? error.message : error);

			return false;
		}
	}

	private failure(
		errorCode: PasswordSignInErrorCode,
		fieldErrors?: Record<string, string>
	): Extract<PasswordSignInResult, { ok: false }> {
		return {
			errorCode,
			fieldErrors,
			message: passwordSignInErrorMessageByCode[errorCode],
			ok: false
		};
	}

	private createFieldErrors(error: z.ZodError): Record<string, string> {
		const fieldErrors: Record<string, string> = {};

		error.issues.forEach((issue) => {
			const field = issue.path[0];

			if (typeof field === 'string') {
				fieldErrors[field] = issue.message;
			}
		});

		return fieldErrors;
	}
}
