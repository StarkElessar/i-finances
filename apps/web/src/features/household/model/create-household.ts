import { ApiHttpError } from '@/shared/api';

import { createHouseholdInputSchema, type HouseholdResult, type HouseholdSummary } from '@i-finances/contracts';

export type CreateHouseholdGateway = {
	create: (name: string) => Promise<HouseholdResult>;
};

export type CreateHouseholdOutcome =
	/** The household exists and the person is its owner. */
	| { household: HouseholdSummary; kind: 'created' }
	/** The server says the person already has a household (another tab, a second device): the session knows it. */
	| { kind: 'already-in-household' }
	/** The name is empty or too long; the message sits under the field. */
	| { kind: 'invalid-name'; message: string }
	/** Anything else; the message goes into a banner. */
	| { kind: 'failed'; message: string };

export const CREATE_FAILED_MESSAGE = 'Не удалось создать окружение. Проверьте соединение и повторите.';

export const DEFAULT_HOUSEHOLD_NAME = 'Семья';

/**
 * Creates the person's household (flow 5.2, board `Flow-Onboarding`, cards 4 and 5). The name is checked here with the
 * contract schema first, so an empty name never leaves the browser; the server checks it again.
 *
 * Failures come back as values. A network error and an unexpected answer are the same banner for the person; a
 * rejected request (401, 403 `household-required`) is also reported to the access listener by the API client, which
 * moves the app to the sign-in or the onboarding by itself.
 */
export async function createHousehold(gateway: CreateHouseholdGateway, name: string): Promise<CreateHouseholdOutcome> {
	const parsed = createHouseholdInputSchema.safeParse({ name });

	if (!parsed.success) {
		return { kind: 'invalid-name', message: parsed.error.issues[0]?.message ?? CREATE_FAILED_MESSAGE };
	}

	try {
		const result = await gateway.create(parsed.data.name);

		if (result.ok) {
			const { id, name: createdName, role } = result.household;

			return { household: { id, name: createdName, role }, kind: 'created' };
		}

		switch (result.errorCode) {
			case 'already-in-household':
				return { kind: 'already-in-household' };

			case 'invalid-input':
				return { kind: 'invalid-name', message: result.fieldErrors?.name ?? result.message };

			default:
				return { kind: 'failed', message: result.message };
		}
	}
	catch (error: unknown) {
		return {
			kind: 'failed',
			message: error instanceof ApiHttpError ? 'Не удалось создать окружение. Попробуйте ещё раз.' : CREATE_FAILED_MESSAGE
		};
	}
}
