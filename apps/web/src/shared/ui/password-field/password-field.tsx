import { Button } from '@/shared/ui/button';
import { TextField, type TextFieldProps } from '@/shared/ui/text-field';

import { Eye, EyeOff } from 'lucide-solid';
import { createSignal, splitProps } from 'solid-js';

export type PasswordFieldProps = Omit<TextFieldProps, 'endContent' | 'startContent' | 'type'>;

/**
 * A `TextField` for a password with an eye on the right that shows or hides what was typed (mockup `Security`, the
 * password card). Hidden by default; the eye is a real button with a name and a pressed state. `autocomplete` is the
 * caller's: `current-password` or `new-password`.
 */
export function PasswordField(props: PasswordFieldProps) {
	const [local, fieldProps] = splitProps(props, ['disabled']);
	const [isVisible, setIsVisible] = createSignal(false);

	return (
		<TextField
			{...fieldProps}
			disabled={local.disabled}
			endContent={(
				<Button
					aria-label={isVisible() ? 'Скрыть пароль' : 'Показать пароль'}
					aria-pressed={isVisible()}
					disabled={local.disabled}
					iconOnly
					size='sm'
					variant='ghost'
					onClick={() => setIsVisible((current) => !current)}
				>
					{isVisible() ? <EyeOff/> : <Eye/>}
				</Button>
			)}
			type={isVisible() ? 'text' : 'password'}
		/>
	);
}
