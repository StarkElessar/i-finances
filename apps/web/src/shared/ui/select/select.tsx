import css from './select.module.scss';

import { cn } from '@/shared/lib';

import { ChevronDown } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { createUniqueId, For, Show, splitProps } from 'solid-js';

export type SelectSize = 'sm' | 'md' | 'lg';

export type SelectOption = {
	value: string;
	label: string;
	disabled?: boolean;
};

export type SelectProps = Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size' | 'multiple' | 'value' | 'onChange'> & {
	options: readonly SelectOption[];
	value: string;
	onChange?: (value: string) => void;
	label?: string;
	hint?: string;
	error?: string;
	optional?: boolean;
	size?: SelectSize;
};

const sizeClassBySize: Record<SelectSize, string> = {
	sm: css.sizeSm,
	md: css.sizeMd,
	lg: css.sizeLg
};

/** Kit-Pickers: only the chrome is custom; options, keyboard and the iOS picker stay native. */
export function Select(props: SelectProps) {
	const generatedId = createUniqueId();
	const [local, nativeProps] = splitProps(props, [
		'options', 'value', 'onChange', 'label', 'hint', 'error', 'optional', 'size', 'class', 'id', 'aria-describedby'
	]);
	const id = () => local.id ?? generatedId;
	const messageId = () => local.error || local.hint ? `${id()}-message` : undefined;
	const description = () => [local['aria-describedby'], messageId()].filter(Boolean).join(' ') || undefined;

	return (
		<div class={cn(css.field, local.class)}>
			<Show when={local.label}>
				<label class={css.label} for={id()}>
					<span>
						{local.label}
						<Show when={nativeProps.required}> <span aria-hidden='true' class={css.required}>*</span></Show>
					</span>
					<Show when={local.optional && !nativeProps.required}><span class={css.optional}>необязательно</span></Show>
				</label>
			</Show>
			<div class={css.control}>
				<select
					{...nativeProps}
					aria-describedby={description()}
					aria-invalid={Boolean(local.error) || nativeProps['aria-invalid']}
					class={cn(css.input, sizeClassBySize[local.size ?? 'md'])}
					id={id()}
					value={local.value}
					onChange={(event) => local.onChange?.(event.currentTarget.value)}
				>
					<For each={local.options}>
						{(option) => (
							<option disabled={option.disabled} selected={option.value === local.value} value={option.value}>
								{option.label}
							</option>
						)}
					</For>
				</select>
				<ChevronDown aria-hidden='true' class={css.icon}/>
			</div>
			<Show when={local.error || local.hint}>
				<div aria-live={local.error ? 'polite' : undefined} class={cn(css.message, local.error && css.error)} id={messageId()}>
					{local.error || local.hint}
				</div>
			</Show>
		</div>
	);
}
