import css from './contact-card.module.scss';

import type { CurrencyCodeValue } from '@/shared/lib';
import { cn, formatMinorUnitsCurrency } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { FlatCard } from '@/shared/ui/flat-card';
import { IconTile } from '@/shared/ui/icon-tile';

import { Building2, Pencil, User } from 'lucide-solid';
import { Show } from 'solid-js';

export type ContactCardProps = {
	name: string;
	kind: 'company' | 'person';
	/** Already formatted for display by the caller's phone formatter. */
	phone?: string | null;
	tint?: string;
	spentMinor: number;
	currency: CurrencyCodeValue;
	onEdit?: () => void;
	class?: string;
};

/** Company or person from M/D-Contacts, with monthly spending in both cases. */
export function ContactCard(props: ContactCardProps) {
	const isCompany = () => props.kind === 'company';

	return (
		<FlatCard class={cn(css.root, props.class)} variant='outlined'>
			<div class={css.content}>
				<div class={css.header}>
					<IconTile tint={props.tint ?? (isCompany() ? 'var(--color-series-6)' : 'var(--color-series-7)')}>
						<Show fallback={<User/>} when={isCompany()}><Building2/></Show>
					</IconTile>
					<div class={css.identity}>
						<div class={css.name}>{props.name}</div>
						<div class={css.description}>
							{isCompany() ? 'Компания' : 'Человек'}<Show when={props.phone}> · {props.phone}</Show>
						</div>
					</div>
					<Show when={props.onEdit}>
						<Button
							aria-label={`Редактировать контакт ${props.name}`}
							iconOnly
							size='sm'
							variant='ghost'
							onClick={props.onEdit}
						>
							<Pencil size={16}/>
						</Button>
					</Show>
				</div>
				<div class={css.spending}>
					<div class={css.label}>Потрачено в этом месяце</div>
					<b>{formatMinorUnitsCurrency(props.spentMinor, props.currency)}</b>
				</div>
			</div>
		</FlatCard>
	);
}
