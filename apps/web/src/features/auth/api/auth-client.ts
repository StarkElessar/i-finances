import {
	type CurrentSessionResponse,
	currentSessionResponseSchema,
	type PasswordSignInInput,
	passwordSignInInputSchema,
	type PasswordSignInResult,
	passwordSignInResultSchema,
	type PasswordSignOutResult,
	passwordSignOutResultSchema
} from '@i-finances/contracts';

import {
	ApiClient,
	type ApiClientOptions,
	ApiHttpError
} from '../../../shared/api';

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
}
