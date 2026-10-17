import css from './card-details-form-section.module.scss';

import { formatCardNumberPreview } from '@/shared/lib';
import { CardExpiryField } from '@/shared/ui/card-expiry-field';
import { CardFace } from '@/shared/ui/card-face';
import { CardNumberField } from '@/shared/ui/card-number-field';

import { extractCardDigits } from '@i-finances/contracts';

import type { AccountDetailsFormSectionProps } from '../../model/account-details-descriptor';

/**
 * Card number and expiry inputs with a live card preview.
 */
export function CardDetailsFormSection(props: AccountDetailsFormSectionProps) {
	const cardNumber = () => props.draft.cardNumber;
	const expiry = () => props.draft.expiry;

	const handleCardNumberChange = (value: string) => {
		props.onChange({ ...props.draft, cardNumber: value });
	};

	const handleExpiryChange = (value: string) => {
		props.onChange({ ...props.draft, expiry: value });
	};

	return (
		<section aria-label='Реквизиты карты' class={css.section}>
			<CardFace
				class={css.preview}
				color={props.accentColor}
				expiry={expiry() || 'ММ/ГГ'}
				holder={props.holder}
				number={formatCardNumberPreview(extractCardDigits(cardNumber()))}
				title={props.title}
			/>
			<div class={css.fields}>
				<CardNumberField
					disabled={props.disabled}
					error={props.errors?.['details.cardNumber']}
					optional
					value={cardNumber()}
					onValueChange={handleCardNumberChange}
				/>
				<CardExpiryField
					class={css.expiryField}
					disabled={props.disabled}
					error={props.errors?.['details.expiry']}
					optional
					value={expiry()}
					onValueChange={handleExpiryChange}
				/>
			</div>
		</section>
	);
}
