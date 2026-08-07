import {
	type PasswordSignInErrorCode,
	passwordSignInErrorMessageByCode,
	passwordSignInInputSchema,
	type PasswordSignInResult
} from '@i-finances/contracts';
import type { z } from 'zod';

import type { LoginRateLimiter } from './login-rate-limiter';
import { normalizeUsername } from './normalize-username';
import type { PasswordService } from './password-service';
import type { PasswordUserRepository } from './password-user-repository';
import type { SessionService } from './session-service';
import { type CreatedSession } from './session-service';
import { validateReturnPath } from './validate-return-path';

export type PasswordSignInMetadata = {
	ipAddress?: string;
	userAgent?: string;
};

export type PasswordSignInOutcome =
	| Extract<PasswordSignInResult, { ok: true }> & { session: CreatedSession }
	| Extract<PasswordSignInResult, { ok: false }>;

export type PasswordVerificationPort = Pick<PasswordService, 'verify'>;
export type PasswordUserPort = Pick<PasswordUserRepository, 'findByUsername'>;
export type SessionCreationPort = Pick<SessionService, 'createSession'>;
export type LoginRateLimitPort = Pick<
	LoginRateLimiter,
	'check' | 'clear' | 'recordFailure'
>;

export type PasswordSignInServiceDependencies = {
	passwordService: PasswordVerificationPort;
	rateLimiter: LoginRateLimitPort;
	sessionService: SessionCreationPort;
	userRepository: PasswordUserPort;
};

export class PasswordSignInService {
	private readonly passwordService: PasswordVerificationPort;
	private readonly rateLimiter: LoginRateLimitPort;
	private readonly sessionService: SessionCreationPort;
	private readonly userRepository: PasswordUserPort;

	public constructor(dependencies: PasswordSignInServiceDependencies) {
		this.passwordService = dependencies.passwordService;
		this.rateLimiter = dependencies.rateLimiter;
		this.sessionService = dependencies.sessionService;
		this.userRepository = dependencies.userRepository;
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

		const username = normalizeUsername(parsedInput.data.username);
		const rateLimitInput = {
			ipAddress: metadata.ipAddress,
			username
		};

		if (!this.rateLimiter.check(rateLimitInput).allowed) {
			return this.failure('rate-limited');
		}

		const user = await this.userRepository.findByUsername(username);
		const isPasswordValid = user?.isActive === true
			? await this.passwordService.verify(user.passwordHash, parsedInput.data.password)
			: false;

		if (user === undefined || !user.isActive || !isPasswordValid) {
			this.rateLimiter.recordFailure(rateLimitInput);

			return this.failure('invalid-credentials');
		}

		this.rateLimiter.clear(rateLimitInput);

		return {
			ok: true,
			redirectTo: validateReturnPath(parsedInput.data.returnTo),
			session: await this.sessionService.createSession(user.id, metadata)
		};
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
