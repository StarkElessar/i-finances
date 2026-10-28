import css from './kpi-card.module.scss';

import type { CurrencyCodeValue } from '@/shared/lib';
import { cn, formatMinorUnitsCurrency } from '@/shared/lib';
import { FlatCard } from '@/shared/ui/flat-card';

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

type KpiValue = { amountMinor: number; currency: CurrencyCodeValue; value?: never } | {
	/** Preformatted non-money value, e.g. a percentage. Money uses amountMinor and currency. */
	value: JSX.Element;
	amountMinor?: never;
	currency?: never;
};

export type KpiCardProps = KpiValue & {
	label: string;
	description?: string;
	/** The only coloured KPI on Kit-Surfaces is the successful decrease. */
	tone?: 'neutral' | 'success';
	class?: string;
};

/** Compact indicator from Kit-Surfaces: uppercase label, value, optional explanation. */
export function KpiCard(props: KpiCardProps) {
	const value = () => props.amountMinor === undefined
		? props.value
		: formatMinorUnitsCurrency(props.amountMinor, props.currency, { maximumFractionDigits: 0 });

	return (
		<FlatCard class={cn(css.root, props.class)} variant='outlined'>
			<dl class={css.content}>
				<dt class={css.label}>{props.label}</dt>
				<dd class={cn(css.value, props.tone === 'success' && css.success)}>{value()}</dd>
				<Show when={props.description}><dd class={css.description}>{props.description}</dd></Show>
			</dl>
		</FlatCard>
	);
}
