import css from './checkbox.module.scss';

import { cn } from '@/shared/lib';

import { Check } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Show, splitProps } from 'solid-js';

/**
 * Checkbox properties extending the native SolidJS input contract.
 */
export type CheckboxProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'children' | 'class' | 'type'> & {
	/** Text next to the box. Clicking it toggles the checkbox. Without it set `aria-label`. */
	children?: JSX.Element;
	class?: string;
	inputClass?: string;
};

/**
 * Native checkbox with the kit box (mockup Kit-Controls, «Switch и Checkbox»): a 20 px box that
 * fills with the primary colour and shows a tick when checked, and a label that is part of the
 * hit area (44 px tall on touch screens).
 */
export function Checkbox(props: CheckboxProps) {
	const [local, inputProps] = splitProps(props, ['children', 'class', 'inputClass']);

	return (
		<label class={cn(css.root, local.class)}>
			<span class={css.box}>
				<input {...inputProps} class={cn(css.input, local.inputClass)} type='checkbox'/>
				<span aria-hidden='true' class={css.mark}>
					<Check size={14} strokeWidth={3}/>
				</span>
			</span>
			<Show when={local.children}>
				<span class={css.label}>{local.children}</span>
			</Show>
		</label>
	);
}
