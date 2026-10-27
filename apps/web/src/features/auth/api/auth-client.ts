import {
	ApiClient,
	type ApiClientOptions,
	ApiHttpError
} from '@/shared/api';

import { telegramRequestInit } from '@/features/telegram-request';

import {
	type CurrentSessionResponse,
	currentSessionResponseSchema,
	passkeyAuthenticationOptionsSchema,
	passkeyRegistrationOptionsSchema,
	type PasskeyRegistrationResult,
	passkeyRegistrationResultSchema,
	type PasskeySignInResult,
	passkeySignInResultSchema,
	type PasswordSignInInput,
	passwordSignInInputSchema,
	type PasswordSignInResult,
	passwordSignInResultSchema,
	type PasswordSignOutResult,
	passwordSignOutResultSchema,
	type TelegramSignInCancelResult,
	telegramSignInCancelResultSchema,
	type TelegramSignInCompleteResult,
	telegramSignInCompleteResultSchema,
	type TelegramSignInStartResult,
	telegramSignInStartResultSchema,
	type UpdateDisplayNameResult,
	updateDisplayNameResultSchema
} from '@i-finances/contracts';
import {
	browserSupportsWebAuthn,
	type PublicKeyCredentialRequestOptionsJSON,
	startAuthentication,
	startRegistration
} from '@simplewebauthn/browser';

export type AuthClientOptions = ApiClientOptions & {
	client?: ApiClient;
};

export class AuthClient {
	private readonly client: ApiClient;

	public constructor(options: AuthClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public currentSession(): Promise<CurrentSessionResponse> {
		return this.client.get('/api/auth/session', currentSessionResponseSchema);
	}

	public supportsPasskeys(): boolean {
		return browserSupportsWebAuthn();
	}

	public async signIn(input: PasswordSignInInput): Promise<PasswordSignInResult> {
		const parsedInput = passwordSignInInputSchema.parse(input);

		try {
			return await this.client.post(
				'/api/auth/sign-in',
				parsedInput,
				passwordSignInResultSchema
			);
		}
		catch (error: unknown) {
			if (error instanceof ApiHttpError) {
				const result = passwordSignInResultSchema.safeParse(error.body);

				if (result.success) {
					return result.data;
				}
			}

			throw error;
		}
	}

	/**
	 * `POST /api/auth/telegram/start` (flow 5.1). The browser stores the request secret from the httpOnly cookie of the
	 * answer by itself; a failure stays an `ApiHttpError` (its body is the contract failure, `Retry-After` on a 429).
	 */
	public startTelegramSignIn(invitationToken?: string): Promise<TelegramSignInStartResult> {
		const input = invitationToken === undefined ? {} : { invitationToken };

		return this.client.post('/api/auth/telegram/start', input, telegramSignInStartResultSchema, telegramRequestInit());
	}

	/** One poll of `POST /api/auth/telegram/complete`; `confirmed` means the session cookie is set. */
	public completeTelegramSignIn(code: string): Promise<TelegramSignInCompleteResult> {
		return this.client.post('/api/auth/telegram/complete', { code }, telegramSignInCompleteResultSchema, telegramRequestInit());
	}

	public cancelTelegramSignIn(code: string): Promise<TelegramSignInCancelResult> {
		return this.client.post('/api/auth/telegram/cancel', { code }, telegramSignInCancelResultSchema, telegramRequestInit());
	}

	public signOut(): Promise<PasswordSignOutResult> {
		return this.client.post(
			'/api/auth/sign-out',
			{},
			passwordSignOutResultSchema
		);
	}

	public async updateDisplayName(displayName: string): Promise<UpdateDisplayNameResult> {
		try {
			return await this.client.put(
				'/api/auth/display-name',
				{ displayName },
				updateDisplayNameResultSchema
			);
		}
		catch (error: unknown) {
			if (error instanceof ApiHttpError) {
				const result = updateDisplayNameResultSchema.safeParse(error.body);

				if (result.success) {
					return result.data;
				}
			}

			throw error;
		}
	}

	public async signInWithPasskey(returnTo?: string): Promise<PasskeySignInResult> {
		try {
			const options = await this.client.post(
				'/api/auth/passkey/sign-in/options',
				{},
				passkeyAuthenticationOptionsSchema
			);
			const authenticationResponse = await startAuthentication({
				optionsJSON: options as PublicKeyCredentialRequestOptionsJSON
			});

			return await this.client.post(
				'/api/auth/passkey/sign-in/verification',
				{ response: authenticationResponse, returnTo },
				passkeySignInResultSchema
			);
		}
		catch (error: unknown) {
			if (error instanceof ApiHttpError) {
				const result = passkeySignInResultSchema.safeParse(error.body);

				if (result.success) {
					return result.data;
				}
			}

			throw error;
		}
	}

	public async registerPasskey(deviceName?: string): Promise<PasskeyRegistrationResult> {
		try {
			const options = await this.client.post(
				'/api/auth/passkey/registration/options',
				{},
				passkeyRegistrationOptionsSchema
			);
			const registrationResponse = await startRegistration({
				optionsJSON: options
			});

			return await this.client.post(
				'/api/auth/passkey/registration/verification',
				{ deviceName, response: registrationResponse },
				passkeyRegistrationResultSchema
			);
		}
		catch (error: unknown) {
			if (error instanceof ApiHttpError) {
				const result = passkeyRegistrationResultSchema.safeParse(error.body);

				if (result.success) {
					return result.data;
				}
			}

			throw error;
		}
	}
}
