import { randomUUID } from 'node:crypto';

import {
	passkeyRegistrationErrorMessageByCode,
	type PasskeyRegistrationResult,
	passkeySignInErrorMessageByCode,
	type PasskeySignInResult
} from '@i-finances/contracts';
import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
	WebAuthnCredential as SimpleWebAuthnCredential
} from '@simplewebauthn/server';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse
} from '@simplewebauthn/server';

import { type AuthConfig, getAuthConfig } from './auth-config';
import { base64UrlToUint8Array, uint8ArrayToBase64Url } from './passkey-encoding';
import type { SessionService } from './session-service';
import { type AuthenticatedSession, type CreatedSession } from './session-service';
import { validateReturnPath } from './validate-return-path';
import type {
	ConsumeWebAuthnChallengeInput,
	WebAuthnChallengeInsertRecord,
	WebAuthnChallengeRepository
} from './webauthn-challenge-repository';
import type {
	WebAuthnCredential,
	WebAuthnCredentialRepository,
	WebAuthnCredentialUsage
} from './webauthn-credential-repository';

const WEBAUTHN_CHALLENGE_TTL_MILLISECONDS = 5 * 60 * 1000;

export type PasskeyRequestMetadata = {
	ipAddress?: string;
	requestOrigin: string;
	userAgent?: string;
};

export type PasskeySignInOutcome =
	| Extract<PasskeySignInResult, { ok: true }> & { session: CreatedSession }
	| Extract<PasskeySignInResult, { ok: false }>;

export type WebAuthnServiceDependencies = {
	challengeRepository: Pick<WebAuthnChallengeRepository, 'consume' | 'insert'>;
	config?: AuthConfig;
	createId?: () => string;
	credentialRepository: Pick<
		WebAuthnCredentialRepository,
		'findByCredentialId' | 'findByUserId' | 'insert' | 'updateUsage'
	>;
	now?: () => Date;
	sessionService: Pick<SessionService, 'createSession'>;
};

function createFailureResult(
	errorCode: Extract<PasskeySignInResult, { ok: false }>['errorCode']
): Extract<PasskeySignInResult, { ok: false }> {
	return {
		errorCode,
		message: passkeySignInErrorMessageByCode[errorCode],
		ok: false
	};
}

function normalizeCredentialTransports(
	transports: string[] | null
): SimpleWebAuthnCredential['transports'] {
	return (transports ?? undefined) as SimpleWebAuthnCredential['transports'];
}

function createWebAuthnCredential(
	record: WebAuthnCredential
): SimpleWebAuthnCredential {
	return {
		counter: record.counter,
		id: record.id,
		publicKey: base64UrlToUint8Array(record.publicKey),
		transports: normalizeCredentialTransports(record.transports)
	};
}

/**
 * Owns WebAuthn ceremony policy while keeping transport and persistence outside
 * the application workflow.
 */
export class WebAuthnService {
	private readonly config: AuthConfig;
	private readonly createId: () => string;
	private readonly now: () => Date;

	public constructor(private readonly dependencies: WebAuthnServiceDependencies) {
		this.config = dependencies.config ?? getAuthConfig();
		this.createId = dependencies.createId ?? randomUUID;
		this.now = dependencies.now ?? (() => new Date());
	}

	public async beginAuthentication(): Promise<PublicKeyCredentialRequestOptionsJSON> {
		const options = await generateAuthenticationOptions({
			rpID: this.config.webauthnRpId,
			userVerification: 'preferred'
		});

		await this.storeChallenge({
			challenge: options.challenge,
			purpose: 'authentication'
		});

		return options;
	}

	public async finishAuthentication(input: {
		metadata: PasskeyRequestMetadata;
		response: AuthenticationResponseJSON;
		returnTo?: string;
	}): Promise<PasskeySignInOutcome> {
		const credentialRecord = await this.dependencies.credentialRepository.findByCredentialId(input.response.id);

		if (credentialRecord === undefined || !credentialRecord.user.isActive) {
			return createFailureResult('invalid-credentials');
		}

		let verification;

		try {
			verification = await verifyAuthenticationResponse({
				credential: createWebAuthnCredential(credentialRecord.credential),
				expectedChallenge: (challenge) => this.consumeChallenge({
					challenge,
					purpose: 'authentication'
				}),
				expectedOrigin: this.createExpectedOrigins(input.metadata.requestOrigin),
				expectedRPID: this.config.webauthnRpId,
				requireUserVerification: true,
				response: input.response
			});
		}
		catch {
			return createFailureResult('invalid-credentials');
		}

		if (!verification.verified) {
			return createFailureResult('invalid-credentials');
		}

		const usage: WebAuthnCredentialUsage = {
			backedUp: verification.authenticationInfo.credentialBackedUp,
			counter: verification.authenticationInfo.newCounter,
			deviceType: verification.authenticationInfo.credentialDeviceType,
			id: credentialRecord.credential.id,
			lastUsedAt: this.now()
		};

		await this.dependencies.credentialRepository.updateUsage(usage);

		return {
			ok: true,
			redirectTo: validateReturnPath(input.returnTo),
			session: await this.dependencies.sessionService.createSession(
				credentialRecord.user.id,
				input.metadata
			)
		};
	}

	public async beginRegistration(
		session: AuthenticatedSession
	): Promise<PublicKeyCredentialCreationOptionsJSON> {
		const existingCredentials = await this.dependencies.credentialRepository.findByUserId(session.user.id);
		const options = await generateRegistrationOptions({
			authenticatorSelection: {
				residentKey: 'preferred',
				userVerification: 'preferred'
			},
			attestationType: 'none',
			excludeCredentials: existingCredentials.map((credential) => ({
				id: credential.id,
				transports: normalizeCredentialTransports(credential.transports)
			})),
			rpID: this.config.webauthnRpId,
			rpName: this.config.webauthnRpName,
			userDisplayName: session.user.displayName,
			userID: new TextEncoder().encode(session.user.id),
			userName: session.user.username
		});

		await this.storeChallenge({
			challenge: options.challenge,
			purpose: 'registration',
			userId: session.user.id
		});

		return options;
	}

	public async finishRegistration(input: {
		deviceName?: string;
		metadata: PasskeyRequestMetadata;
		response: RegistrationResponseJSON;
		session: AuthenticatedSession;
	}): Promise<PasskeyRegistrationResult> {
		let verification;

		try {
			verification = await verifyRegistrationResponse({
				expectedChallenge: (challenge) => this.consumeChallenge({
					challenge,
					purpose: 'registration',
					userId: input.session.user.id
				}),
				expectedOrigin: this.createExpectedOrigins(input.metadata.requestOrigin),
				expectedRPID: this.config.webauthnRpId,
				requireUserVerification: true,
				response: input.response
			});
		}
		catch {
			return this.registrationFailure();
		}

		if (!verification.verified) {
			return this.registrationFailure();
		}

		const { credential } = verification.registrationInfo;
		const now = this.now();

		await this.dependencies.credentialRepository.insert({
			backedUp: verification.registrationInfo.credentialBackedUp,
			counter: credential.counter,
			createdAt: now,
			deviceName: input.deviceName,
			deviceType: verification.registrationInfo.credentialDeviceType,
			id: credential.id,
			publicKey: uint8ArrayToBase64Url(credential.publicKey),
			transports: credential.transports,
			userId: input.session.user.id
		});

		return { ok: true };
	}

	private async consumeChallenge(
		input: Omit<ConsumeWebAuthnChallengeInput, 'now'>
	): Promise<boolean> {
		return (await this.dependencies.challengeRepository.consume({
			...input,
			now: this.now()
		})) !== undefined;
	}

	private createExpectedOrigins(requestOrigin: string): string[] {
		const configuredOrigin = new URL(this.config.origin).origin;
		const normalizedRequestOrigin = new URL(requestOrigin).origin;

		return configuredOrigin === normalizedRequestOrigin
			? [configuredOrigin]
			: [configuredOrigin, normalizedRequestOrigin];
	}

	private registrationFailure(): Extract<PasskeyRegistrationResult, { ok: false }> {
		return {
			errorCode: 'verification-failed',
			message: passkeyRegistrationErrorMessageByCode['verification-failed'],
			ok: false
		};
	}

	private async storeChallenge(input: Omit<WebAuthnChallengeInsertRecord, 'createdAt' | 'expiresAt' | 'id'>): Promise<void> {
		const now = this.now();

		await this.dependencies.challengeRepository.insert({
			...input,
			createdAt: now,
			expiresAt: new Date(now.getTime() + WEBAUTHN_CHALLENGE_TTL_MILLISECONDS),
			id: this.createId()
		});
	}
}
