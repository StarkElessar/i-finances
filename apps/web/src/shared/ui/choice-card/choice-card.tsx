import css from './choice-card.module.scss';

import { cn } from '@/shared/lib';

import { Check } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

export type ChoiceCardProps = {
	/** Shared by the cards of one group: the browser moves between them with the arrow keys. */
	name: string;
	value: string;
	checked: boolean;
	onChange: (value: string) => void;
	title: string;
	description?: string;
	/** Shown while the card is not chosen; the chosen card shows a check mark instead. */
	icon: JSX.Element;
	disabled?: boolean;
	class?: string;
};

/**
 * A big radio option with a title and a line of explanation (mockup `.i-type`, board `Flow-Onboarding`): «Создать своё
 * окружение» or «У меня есть приглашение». A native radio under the card gives the group role, arrow keys and
 * announcements for free.
 */
export function ChoiceCard(props: ChoiceCardProps) {
	return (
		<label class={cn(css.root, props.checked && css.checked, props.disabled && css.disabled, props.class)}>
			<input
				checked={props.checked}
				class={css.input}
				disabled={props.disabled}
				name={props.name}
				onChange={() => props.onChange(props.value)}
				type='radio'
				value={props.value}
			/>
			<span class={css.title}>
				<span aria-hidden='true' class={css.icon}>
					<Show fallback={props.icon} when={props.checked}><Check/></Show>
				</span>
				{props.title}
			</span>
			<Show when={props.description}>
				<span class={css.description}>{props.description}</span>
			</Show>
		</label>
	);
}
