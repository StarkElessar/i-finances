import css from './segmented.module.scss';

import { cn, resolveRovingTarget } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';

/**
 * One choice of a segmented control.
 */
export type SegmentedOption<TValue extends string = string> = {
	value: TValue;
	label: string;
	/** Decorative icon before the label (mockup: «Активные», «Архив»). */
	icon?: JSX.Element;
	/** Counter chip after the label. */
	count?: number;
	disabled?: boolean;
};

export type SegmentedProps<TValue extends string = string> = {
	/** Required: the group has no visible caption. */
	'aria-label': string;
	options: readonly SegmentedOption<TValue>[];
	value: TValue;
	onChange: (value: TValue) => void;
	/** Stretch the control and share the width between the options. */
	fullWidth?: boolean;
	class?: string;
};

/**
 * Switch between two to five mutually exclusive modes (period, status, operation type).
 * A `radiogroup`: Tab enters the group at the selected option, arrow keys, Home and End move the
 * selection (mockup Kit-Controls, «Segmented»).
 */
export function Segmented<TValue extends string = string>(props: SegmentedProps<TValue>) {
	const buttons: (HTMLButtonElement | undefined)[] = [];

	/**
	 * The single option in the tab order: the selected one, or the first enabled one when the value
	 * matches nothing.
	 */
	const tabbableValue = () => {
		const selected = props.options.find((option) => option.value === props.value && !option.disabled);

		return (selected ?? props.options.find((option) => !option.disabled))?.value;
	};

	const handleKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
		// From the button that has focus, not from `value`: they differ when the value matches no
		// option or the selected option is disabled.
		const current = buttons.indexOf(event.target as HTMLButtonElement);
		const target = resolveRovingTarget({
			key: event.key,
			current,
			disabled: props.options.map((option) => Boolean(option.disabled))
		});

		if (target === undefined) {
			return;
		}

		event.preventDefault();
		buttons[target]?.focus();
		props.onChange(props.options[target].value);
	};

	return (
		<div
			aria-label={props['aria-label']}
			class={cn(css.root, props.fullWidth && css.fullWidth, props.class)}
			role='radiogroup'
			onKeyDown={handleKeyDown}
		>
			<For each={props.options}>
				{(option, index) => {
					const isSelected = () => option.value === props.value;

					return (
						<button
							ref={(element) => {
								buttons[index()] = element;
							}}
							aria-checked={isSelected()}
							class={cn(css.option, isSelected() && css.optionSelected)}
							disabled={option.disabled}
							role='radio'
							tabIndex={option.value === tabbableValue() ? 0 : -1}
							type='button'
							onClick={() => !isSelected() && props.onChange(option.value)}
						>
							<Show when={option.icon}>
								<span aria-hidden='true' class={css.icon}>{option.icon}</span>
							</Show>
							{option.label}
							<Show when={option.count !== undefined}>
								<span class={css.count}>{option.count}</span>
							</Show>
						</button>
					);
				}}
			</For>
		</div>
	);
}
