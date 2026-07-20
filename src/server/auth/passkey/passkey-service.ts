import { randomUUID } from 'node:crypto';

import type {
    AuthenticationResponseJSON,
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
    RegistrationResponseJSON,
    WebAuthnCredential
} from '@simplewebauthn/server';
import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse
} from '@simplewebauthn/server';

import { getAuthConfig } from '~/server/auth/auth-config';
import {
    base64UrlToUint8Array,
    uint8ArrayToBase64Url
} from '~/server/auth/passkey/passkey-encoding';
import {
    consumeWebauthnChallenge,
    findWebauthnCredentialsByUserId,
    findWebauthnCredentialWithUserById,
    insertWebauthnChallenge,
    insertWebauthnCredential,
    updateWebauthnCredentialUsage
} from '~/server/auth/passkey/passkey-repository';
import { writeSessionCookie } from '~/server/auth/session/auth-cookie';
import type { AuthenticatedSession } from '~/server/auth/session/session-service';
import { createSession } from '~/server/auth/session/session-service';
import { validateReturnPath } from '~/server/auth/validate-return-path';
import type {
    PasskeySignInErrorCode,
    PasskeySignInResult
} from '~/views/sign-in/api/passkey-sign-in.contract';
import {
    passkeySignInErrorMessageByCode
} from '~/views/sign-in/api/passkey-sign-in.contract';

const WEBAUTHN_CHALLENGE_TTL_MILLISECONDS = 5 * 60 * 1000;

type PasskeyRequestMetadata = {
    ipAddress?: string;
    requestOrigin: string;
    userAgent?: string;
};

type PasskeySignInSuccessResult = Extract<PasskeySignInResult, { ok: true }> & {
    statusCode: number;
};

type PasskeySignInFailureResult = Extract<PasskeySignInResult, { ok: false }> & {
    statusCode: number;
};

export type PasskeySignInServerResult = PasskeySignInSuccessResult | PasskeySignInFailureResult;

export type PasskeyRegistrationResult = {
    ok: boolean;
    message?: string;
};

/**
 * Returns the origins accepted by WebAuthn verification in this request.
 */
function createExpectedOrigins(requestOrigin: string): string[] {
    const configuredOrigin = new URL(getAuthConfig().origin).origin;

    return configuredOrigin === requestOrigin
        ? [configuredOrigin]
        : [configuredOrigin, requestOrigin];
}

/**
 * Creates an expiring one-time WebAuthn challenge row.
 */
async function storeChallenge(input: {
    challenge: string;
    purpose: 'authentication' | 'registration';
    userId?: string;
}): Promise<void> {
    const now = new Date();

    await insertWebauthnChallenge({
        id: randomUUID(),
        challenge: input.challenge,
        purpose: input.purpose,
        userId: input.userId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + WEBAUTHN_CHALLENGE_TTL_MILLISECONDS)
    });
}

/**
 * Normalizes nullable SQLite JSON into SimpleWebAuthn's optional transports.
 */
function normalizeCredentialTransports(transports: string[] | null): WebAuthnCredential['transports'] {
    return (transports ?? undefined) as WebAuthnCredential['transports'];
}

/**
 * Converts a persisted credential into SimpleWebAuthn verification input.
 */
function createWebAuthnCredential(record: {
    id: string;
    publicKey: string;
    counter: number;
    transports: string[] | null;
}): WebAuthnCredential {
    return {
        id: record.id,
        publicKey: base64UrlToUint8Array(record.publicKey),
        counter: record.counter,
        transports: normalizeCredentialTransports(record.transports)
    };
}

/**
 * Creates a failed passkey sign-in result with an HTTP status.
 */
function createFailureResult(errorCode: PasskeySignInErrorCode, statusCode: number): PasskeySignInFailureResult {
    return {
        ok: false,
        errorCode,
        message: passkeySignInErrorMessageByCode[errorCode],
        statusCode
    };
}

/**
 * Begins discoverable-credential authentication for passkey-first sign-in.
 */
export async function beginPasskeyAuthentication(): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const authConfig = getAuthConfig();
    const options = await generateAuthenticationOptions({
        rpID: authConfig.webauthnRpId,
        userVerification: 'preferred'
    });

    await storeChallenge({
        challenge: options.challenge,
        purpose: 'authentication'
    });

    return options;
}

/**
 * Verifies a passkey assertion and creates an application session.
 */
export async function finishPasskeyAuthentication(input: {
    response: AuthenticationResponseJSON;
    metadata: PasskeyRequestMetadata;
    returnTo?: string;
}): Promise<PasskeySignInServerResult> {
    const credentialRecord = await findWebauthnCredentialWithUserById(input.response.id);

    if (!credentialRecord || !credentialRecord.user.isActive) {
        return createFailureResult('invalid-credentials', 401);
    }

    try {
        const verification = await verifyAuthenticationResponse({
            response: input.response,
            expectedChallenge: async (challenge) => Boolean(await consumeWebauthnChallenge({
                challenge,
                purpose: 'authentication',
                now: new Date()
            })),
            expectedOrigin: createExpectedOrigins(input.metadata.requestOrigin),
            expectedRPID: getAuthConfig().webauthnRpId,
            credential: createWebAuthnCredential(credentialRecord.credential),
            requireUserVerification: true
        });

        if (!verification.verified) {
            return createFailureResult('invalid-credentials', 401);
        }

        await updateWebauthnCredentialUsage({
            id: credentialRecord.credential.id,
            counter: verification.authenticationInfo.newCounter,
            deviceType: verification.authenticationInfo.credentialDeviceType,
            backedUp: verification.authenticationInfo.credentialBackedUp,
            lastUsedAt: new Date()
        });

        const session = await createSession(credentialRecord.user.id, {
            ipAddress: input.metadata.ipAddress,
            userAgent: input.metadata.userAgent
        });

        writeSessionCookie(session.token, session.expiresAt);

        return {
            ok: true,
            redirectTo: validateReturnPath(input.returnTo),
            statusCode: 200
        };
    }
    catch {
        return createFailureResult('invalid-credentials', 401);
    }
}

/**
 * Begins passkey enrollment for an already authenticated user.
 */
export async function beginPasskeyRegistration(session: AuthenticatedSession): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const authConfig = getAuthConfig();
    const existingCredentials = await findWebauthnCredentialsByUserId(session.user.id);
    const options = await generateRegistrationOptions({
        rpName: authConfig.webauthnRpName,
        rpID: authConfig.webauthnRpId,
        userName: session.user.username,
        userID: new TextEncoder().encode(session.user.id),
        userDisplayName: session.user.displayName,
        attestationType: 'none',
        excludeCredentials: existingCredentials.map((credential) => ({
            id: credential.id,
            transports: normalizeCredentialTransports(credential.transports)
        })),
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred'
        }
    });

    await storeChallenge({
        challenge: options.challenge,
        purpose: 'registration',
        userId: session.user.id
    });

    return options;
}

/**
 * Verifies and stores a newly enrolled passkey.
 */
export async function finishPasskeyRegistration(input: {
    deviceName?: string;
    metadata: PasskeyRequestMetadata;
    response: RegistrationResponseJSON;
    session: AuthenticatedSession;
}): Promise<PasskeyRegistrationResult> {
    try {
        const verification = await verifyRegistrationResponse({
            response: input.response,
            expectedChallenge: async (challenge) => Boolean(await consumeWebauthnChallenge({
                challenge,
                purpose: 'registration',
                now: new Date(),
                userId: input.session.user.id
            })),
            expectedOrigin: createExpectedOrigins(input.metadata.requestOrigin),
            expectedRPID: getAuthConfig().webauthnRpId,
            requireUserVerification: true
        });

        if (!verification.verified) {
            return {
                ok: false,
                message: 'Не удалось проверить новый ключ доступа.'
            };
        }

        const { credential } = verification.registrationInfo;
        const now = new Date();

        await insertWebauthnCredential({
            id: credential.id,
            userId: input.session.user.id,
            publicKey: uint8ArrayToBase64Url(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports,
            deviceType: verification.registrationInfo.credentialDeviceType,
            backedUp: verification.registrationInfo.credentialBackedUp,
            deviceName: input.deviceName,
            createdAt: now
        });

        return { ok: true };
    }
    catch {
        return {
            ok: false,
            message: 'Не удалось сохранить ключ доступа.'
        };
    }
}
