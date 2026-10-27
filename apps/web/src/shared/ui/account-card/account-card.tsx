import css from './account-card.module.scss';

import type { AccountTypeValue, CurrencyCodeValue } from '@/shared/lib';
import { cn, formatMinorUnitsCurrency, getAccountTypeMeta, maskCardNumberShort } from '@/shared/lib';
import { Badge } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';

import { Archive, Banknote, CreditCard, type LucideIcon, Wallet } from 'lucide-solid';
import { Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

export type AccountCardProps = {
	name: string;
	type: AccountTypeValue;
	balanceMinor: number;
	currency: CurrencyCodeValue;
	tint: string;
	onSelect: () => void;
	selected?: boolean;
	holder?: string;
	/** Last four digits only. Never pass a full card number to a list card. */
	cardLast4?: string | null;
	expired?: boolean;
	class?: string;
};

const iconsByType: Record<AccountTypeValue, LucideIcon> = { card: CreditCard, cash: Banknote, savings: Archive, other: Wallet };

/** Account list row from Kit-AccountCard; payment-card previews belong to CardFace. */
export function AccountCard(props: AccountCardProps) {
	const handleSelect = () => {
		if (!props.selected) {
			props.onSelect();
		}
	};

	return (
		<div class={cn(css.root, props.selected && css.selected, props.class)} style={{ '--account-tint': props.tint }}>
			<button aria-pressed={Boolean(props.selected)} class={css.button} type='button' onClick={handleSelect}>
				<IconTile tint={props.tint}><Dynamic component={iconsByType[props.type]}/></IconTile>
				<span class={css.content}>
					<span class={css.titleRow}>
						<span class={css.name}>{props.name}</span>
						<Show when={props.holder}><Badge>{props.holder}</Badge></Show>
					</span>
					<span class={css.description}>
						{getAccountTypeMeta(props.type).label}
						<Show when={props.type === 'card' && props.cardLast4}> · {maskCardNumberShort(props.cardLast4 ?? null)}</Show>
						<Show when={props.type === 'card' && props.expired}> · <span class={css.expired}>истёк</span></Show>
					</span>
				</span>
				<span class={css.balance}>{formatMinorUnitsCurrency(props.balanceMinor, props.currency)}</span>
			</button>
		</div>
	);
}
