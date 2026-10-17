import { formatCardNumberInput } from '@/shared/lib';

import { cardAccountDetailsFullSchema, extractCardDigits } from '@i-finances/contracts';

const EMPTY_DRAFT = { cardNumber: '', expiry: '' } as const;

type DraftFields = Record<string, string | undefined>;

function readField(draft: DraftFields, key: string): string {
	return draft[key] ?? '';
}

/**
 * Builds form inputs from `GET /api/accounts/:id` details; anything unexpected becomes an empty draft.
 */
export function createCardDraft(details: unknown): Record<string, string> {
	const parsed = cardAccountDetailsFullSchema.safeParse(details);

	if (!parsed.success) {
		return { ...EMPTY_DRAFT };
	}

	return {
		cardNumber: formatCardNumberInput(parsed.data.cardNumber ?? ''),
		expiry: parsed.data.expiry ?? ''
	};
}

/**
 * Converts input strings to the `cardAccountDetailsInputSchema` shape; empty means `null`.
 */
export function cardDraftToInput(draft: DraftFields): Record<string, string | null> {
	const digits = extractCardDigits(readField(draft, 'cardNumber'));
	const expiry = readField(draft, 'expiry');

	return {
		cardNumber: digits === '' ? null : digits,
		expiry: expiry === '' ? null : expiry
	};
}

export function hasCardDraftData(draft: DraftFields): boolean {
	return readField(draft, 'cardNumber') !== '' || readField(draft, 'expiry') !== '';
}
