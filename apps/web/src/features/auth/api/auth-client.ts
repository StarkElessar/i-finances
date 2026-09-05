import {
	ApiClient,
	type ApiClientOptions,
	ApiHttpError
} from '@/shared/api';

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
	passwordSignOutResultSchema
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

	public signOut(): Promise<PasswordSignOutResult> {
		return this.client.post(
			'/api/auth/sign-out',
			{},
			passwordSignOutResultSchema
		);
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
