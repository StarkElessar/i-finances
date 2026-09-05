import css from './text-field.module.scss';

import { cn } from '@/shared/lib';

import type { JSX } from 'solid-js';
import { children, createUniqueId, Show, splitProps } from 'solid-js';

export type TextFieldSize = 'sm' | 'md' | 'lg';
export type TextFieldVariant = 'outline' | 'filled';

export type TextFieldProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'children' | 'class' | 'size'> & {
	label?: string;
	hint?: string;
	error?: string;
	optional?: boolean;
	size?: TextFieldSize;
	variant?: TextFieldVariant;
	startContent?: JSX.Element;
	endContent?: JSX.Element;
	class?: string;
	inputClass?: string;
};

const sizeClassBySize: Record<TextFieldSize, string> = {
	sm: css.sizeSm,
	md: css.sizeMd,
	lg: css.sizeLg
};

const variantClassByVariant: Record<TextFieldVariant, string> = {
	outline: css.variantOutline,
	filled: css.variantFilled
};

export function TextField(props: TextFieldProps) {
	const generatedId = createUniqueId();
	const [local, inputProps] = splitProps(props, [
		'label', 'hint', 'error', 'optional', 'size', 'variant', 'startContent', 'endContent', 'class', 'inputClass',
		'id', 'required', 'disabled', 'readOnly', 'aria-describedby'
	]);
	const startContent = children(() => local.startContent);
	const endContent = children(() => local.endContent);

	const resolveInputId = (): string => local.id ?? generatedId;
	const resolveMessageId = (): string | undefined => local.error || local.hint
		? `${resolveInputId()}-message`
		: undefined;
	const resolveAriaDescription = (): string | undefined => {
		const providedId = local['aria-describedby'];
		const messageId = resolveMessageId();

		if (providedId && messageId) {
			return `${providedId} ${messageId}`;
		}

		return providedId ?? messageId;
	};

	return (
		<div class={cn(css.field, local.class)}>
			<Show when={local.label}>
				<label class={css.labelRow} for={resolveInputId()}>
					<span class={css.label}>{local.label}</span>
					<Show when={local.required}><span aria-hidden='true' class={css.required}>*</span></Show>
					<Show when={local.optional && !local.required}><span class={css.optional}>необязательно</span></Show>
				</label>
			</Show>
			<div
				class={cn(
					css.control,
					sizeClassBySize[local.size ?? 'md'],
					variantClassByVariant[local.variant ?? 'outline'],
					local.error && css.invalid,
					local.disabled && css.disabled,
					local.readOnly && css.readonly
				)}
			>
				<Show keyed when={startContent()}>{(content) => <span class={css.adornment}>{content}</span>}</Show>
				<input
					{...inputProps}
					aria-describedby={resolveAriaDescription()}
					aria-invalid={Boolean(local.error) || undefined}
					class={cn(css.input, local.inputClass)}
					disabled={local.disabled}
					id={resolveInputId()}
					readOnly={local.readOnly}
					required={local.required}
				/>
				<Show keyed when={endContent()}>{(content) => <span class={css.adornment}>{content}</span>}</Show>
			</div>
			<Show when={local.error || local.hint}>
				<div
					aria-live={local.error ? 'polite' : undefined}
					class={cn(css.message, local.error && css.messageError)}
					id={resolveMessageId()}
				>
					{local.error ?? local.hint}
				</div>
			</Show>
		</div>
	);
}
