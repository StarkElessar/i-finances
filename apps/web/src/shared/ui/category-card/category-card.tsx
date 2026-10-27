import css from './category-card.module.scss';

import type { CurrencyCodeValue } from '@/shared/lib';
import { cn, formatMinorUnitsCurrency } from '@/shared/lib';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { FlatCard } from '@/shared/ui/flat-card';
import { IconTile } from '@/shared/ui/icon-tile';
import { Progress, type ProgressTone } from '@/shared/ui/progress';

import { Pencil } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

export type CategoryCardProps = {
	name: string;
	icon: JSX.Element;
	tint: string;
	spentMinor: number;
	currency: CurrencyCodeValue;
	/** A positive monthly budget. Zero, null and undefined mean no budget, as in the category model. */
	budgetMinor?: number | null;
	/** Kit shows a warning at 91%; it does not specify a threshold. The caller chooses the warning. */
	budgetTone?: 'info' | 'warning';
	onEdit?: () => void;
	class?: string;
};

/** Category spending, budget and overrun; independent of the screen's data model. */
export function CategoryCard(props: CategoryCardProps) {
	const budget = () => props.budgetMinor && props.budgetMinor > 0 ? props.budgetMinor : undefined;
	const percent = () => Math.round(props.spentMinor / (budget() ?? 1) * 100);
	const overrun = () => Math.max(0, props.spentMinor - (budget() ?? 0));
	const tone = (): ProgressTone => {
		if (overrun() > 0) {
			return 'danger';
		}

		return props.budgetTone ?? 'info';
	};

	return (
		<FlatCard class={cn(css.root, props.class)} variant='outlined'>
			<div class={css.content}>
				<div class={css.header}>
					<IconTile tint={props.tint}>{props.icon}</IconTile>
					<div class={css.identity}>
						<div class={css.name}>{props.name}</div>
						<div class={css.spent}>Потрачено <b>{formatMinorUnitsCurrency(props.spentMinor, props.currency)}</b></div>
					</div>
					<Show when={budget()}><Badge tone={tone()}>{percent()}%</Badge></Show>
					<Show when={props.onEdit}>
						<Button
							aria-label={`Редактировать категорию ${props.name}`}
							iconOnly
							size='sm'
							variant='ghost'
							onClick={props.onEdit}
						>
							<Pencil size={16}/>
						</Button>
					</Show>
				</div>
				<Show when={budget()}>
					<Progress
						aria-label={`Бюджет категории ${props.name}`}
						aria-valuetext={`${percent()}%`}
						tone={tone()}
						value={percent()}
					/>
				</Show>
				<div class={css.footer}>
					<Show fallback='Без бюджета' when={budget()}>
						Бюджет {formatMinorUnitsCurrency(budget() ?? 0, props.currency)}
						<Show when={overrun() > 0}> · превышение {formatMinorUnitsCurrency(overrun(), props.currency)}</Show>
					</Show>
				</div>
			</div>
		</FlatCard>
	);
}
