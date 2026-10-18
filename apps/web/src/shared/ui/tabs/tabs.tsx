import css from './tabs.module.scss';

import { cn, resolveRovingTarget } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { For } from 'solid-js';

/**
 * One tab of the strip.
 */
export type TabOption<TValue extends string = string> = {
	value: TValue;
	label: string;
	disabled?: boolean;
};

export type TabsProps<TValue extends string = string> = {
	/** Required: the strip has no visible caption. */
	'aria-label': string;
	options: readonly TabOption<TValue>[];
	value: TValue;
	onChange: (value: TValue) => void;
	class?: string;
};

/**
 * Sections of one page (mockup Kit-Controls, «Tabs: разделы страницы»). A `tablist`: Tab enters the
 * strip at the selected tab, arrow keys, Home and End move the selection and focus together.
 */
export function Tabs<TValue extends string = string>(props: TabsProps<TValue>) {
	const buttons: (HTMLButtonElement | undefined)[] = [];

	/**
	 * The single tab in the tab order: the selected one, or the first enabled one when the value
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
			class={cn(css.root, props.class)}
			role='tablist'
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
							aria-selected={isSelected()}
							class={cn(css.tab, isSelected() && css.tabSelected)}
							disabled={option.disabled}
							role='tab'
							tabIndex={option.value === tabbableValue() ? 0 : -1}
							type='button'
							onClick={() => !isSelected() && props.onChange(option.value)}
						>
							{option.label}
						</button>
					);
				}}
			</For>
		</div>
	);
}
