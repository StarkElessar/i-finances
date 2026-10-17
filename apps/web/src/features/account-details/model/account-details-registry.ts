import type { AccountTypeValue } from '@/shared/lib';

import { CardDetailsFormSection } from '../ui/card/card-details-form-section';
import { CardHeaderVisual } from '../ui/card/card-header-visual';

import type { AccountDetailsDescriptor } from './account-details-descriptor';
import { cardDraftToInput, createCardDraft, hasCardDraftData } from './card-draft';

const cardDescriptor: AccountDetailsDescriptor = {
	FormSection: CardDetailsFormSection,
	HeaderVisual: CardHeaderVisual,
	createDraft: createCardDraft,
	hasData: hasCardDraftData,
	toInput: cardDraftToInput
};

/**
 * Exhaustive over account types: adding a type fails the build until it is listed.
 * `null` means the type has no type-specific fields.
 */
export const ACCOUNT_DETAILS_REGISTRY: Record<AccountTypeValue, AccountDetailsDescriptor | null> = {
	card: cardDescriptor,
	cash: null,
	other: null,
	savings: null
};
