import { isCardExpired, maskCardNumberShort } from '@/shared/lib';
import { CardFace } from '@/shared/ui/card-face';

import { cardAccountDetailsViewSchema } from '@i-finances/contracts';
import { Show } from 'solid-js';

import type { AccountDetailsHeaderVisualProps } from '../../model/account-details-descriptor';

/**
 * Header badge for a card account: mini card with last four digits and expiry.
 * Falls back to the regular icon tile when the card has no details yet.
 */
export function CardHeaderVisual(props: AccountDetailsHeaderVisualProps) {
	const details = () => {
		const parsed = cardAccountDetailsViewSchema.safeParse(props.account.details);

		return parsed.success ? parsed.data : undefined;
	};
	const hasDetails = () => Boolean(details()?.cardNumberLast4 ?? details()?.expiry);
	const isExpired = () => {
		const expiry = details()?.expiry;

		return expiry ? isCardExpired(expiry, new Date()) : false;
	};
	const label = () => {
		const current = details();

		if (!current) {
			return undefined;
		}

		const parts = [
			current.cardNumberLast4 ? `Карта ${maskCardNumberShort(current.cardNumberLast4)}` : 'Карта',
			current.expiry ? `действует до ${current.expiry}` : undefined,
			isExpired() ? 'срок истёк' : undefined
		];

		return parts.filter(Boolean).join(', ');
	};

	return (
		<Show fallback={props.fallback} when={hasDetails()}>
			<CardFace
				color={props.account.color}
				expired={isExpired()}
				expiry={details()?.expiry ?? undefined}
				label={label()}
				number={maskCardNumberShort(details()?.cardNumberLast4 ?? null)}
				size='mini'
			/>
		</Show>
	);
}
