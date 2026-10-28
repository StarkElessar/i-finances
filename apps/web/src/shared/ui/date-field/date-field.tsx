import css from './date-field.module.scss';

import { cn } from '@/shared/lib';

import { Calendar } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { createUniqueId, Show, splitProps } from 'solid-js';

export type DateFieldSize = 'sm' | 'md' | 'lg';

export type DateFieldProps = Omit<
	JSX.InputHTMLAttributes<HTMLInputElement>,
	'children' | 'type' | 'size' | 'value' | 'min' | 'max' | 'onChange'
> & {
	/** Native date strings: YYYY-MM-DD, or an empty string. No Date conversion or timezone adjustment. */
	value: string;
	min?: string;
	max?: string;
	onChange?: (value: string) => void;
	label?: string;
	hint?: string;
	error?: string;
	optional?: boolean;
	size?: DateFieldSize;
};

const sizeClassBySize: Record<DateFieldSize, string> = {
	sm: css.sizeSm,
	md: css.sizeMd,
	lg: css.sizeLg
};

/** Kit-Pickers: keeps the native calendar hit target and touch picker. Display follows the OS locale. */
export function DateField(props: DateFieldProps) {
	const generatedId = createUniqueId();
	const [local, nativeProps] = splitProps(props, [
		'value', 'onChange', 'label', 'hint', 'error', 'optional', 'size', 'class', 'id', 'aria-describedby'
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
				<input
					{...nativeProps}
					aria-describedby={description()}
					aria-invalid={Boolean(local.error) || nativeProps['aria-invalid']}
					class={cn(css.input, sizeClassBySize[local.size ?? 'md'])}
					id={id()}
					type='date'
					value={local.value}
					onChange={(event) => local.onChange?.(event.currentTarget.value)}
				/>
				<Calendar aria-hidden='true' class={css.icon}/>
			</div>
			<Show when={local.error || local.hint}>
				<div aria-live={local.error ? 'polite' : undefined} class={cn(css.message, local.error && css.error)} id={messageId()}>
					{local.error || local.hint}
				</div>
			</Show>
		</div>
	);
}
