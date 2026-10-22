import css from './avatar.module.scss';

import { cn } from '@/shared/lib';

export type AvatarSize = 'lg' | 'md';

export type AvatarProps = {
	/** One or two capital letters (`getInitials`). The name next to the avatar carries the meaning, so it is hidden from readers. */
	initials: string;
	size?: AvatarSize;
	class?: string;
};

/**
 * Round initials tile of a person (mockup `.i-avatar`, boards `M-Household`, `D-Household`).
 */
export function Avatar(props: AvatarProps) {
	return (
		<span aria-hidden='true' class={cn(css.root, props.size === 'lg' ? css.sizeLg : css.sizeMd, props.class)}>
			{props.initials}
		</span>
	);
}
