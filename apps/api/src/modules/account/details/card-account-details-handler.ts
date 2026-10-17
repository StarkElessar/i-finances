import type { StoredAccountDetails } from '@/infrastructure/database/schema/column-types';

import {
	cardAccountDetailsInputSchema,
	type StoredCardAccountDetails,
	storedCardAccountDetailsSchema
} from '@i-finances/contracts';

import type { AccountDetailsHandler } from './account-details-handler';

function readStored(stored: StoredAccountDetails): StoredCardAccountDetails {
	const parsed = storedCardAccountDetailsSchema.safeParse(stored);

	return parsed.success ? parsed.data : {};
}

/**
 * Card details: optional 16-digit number and `MM/YY` expiry.
 */
export class CardAccountDetailsHandler implements AccountDetailsHandler {
	public toFull(stored: StoredAccountDetails): Record<string, unknown> {
		const card = readStored(stored);

		return {
			cardNumber: card.cardNumber ?? null,
			cardNumberLast4: card.cardNumber?.slice(-4) ?? null,
			expiry: card.expiry ?? null
		};
	}

	public toStored(input: unknown, current: StoredAccountDetails | undefined): StoredAccountDetails {
		if (input === undefined) {
			return current === undefined ? {} : readStored(current);
		}

		const details = cardAccountDetailsInputSchema.parse(input);
		const stored: StoredCardAccountDetails = {};

		if (details.cardNumber !== null) {
			stored.cardNumber = details.cardNumber;
		}

		if (details.expiry !== null) {
			stored.expiry = details.expiry;
		}

		return stored;
	}

	public toView(stored: StoredAccountDetails): Record<string, unknown> {
		const card = readStored(stored);

		return {
			cardNumberLast4: card.cardNumber?.slice(-4) ?? null,
			expiry: card.expiry ?? null
		};
	}
}
