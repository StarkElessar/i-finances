import css from './card-face.module.scss';

import { cn, getReadableTextColor } from '@/shared/lib';

import { Show } from 'solid-js';

export type CardFaceSize = 'full' | 'mini';

export type CardFaceProps = {
	color: string;
	number: string;
	class?: string;
	expired?: boolean;
	expiry?: string;
	holder?: string;
	label?: string;
	size?: CardFaceSize;
	title?: string;
};

/**
 * Payment-card visual tinted with the account colour.
 */
export function CardFace(props: CardFaceProps) {
	const isMini = () => props.size === 'mini';

	return (
		<div
			aria-label={props.label}
			class={cn(css.root, isMini() ? css.sizeMini : css.sizeFull, props.class)}
			role={props.label ? 'img' : undefined}
			style={{
				'--account-color': props.color,
				'--card-face-text': getReadableTextColor(props.color)
			}}
		>
			<Show when={!isMini() && props.title}>
				<span class={css.title}>{props.title}</span>
			</Show>
			<Show when={isMini()}>
				<svg
					aria-hidden='true'
					class={css.chip}
					fill='none'
					height='14'
					stroke='currentColor'
					stroke-linecap='round'
					stroke-linejoin='round'
					stroke-width='2'
					viewBox='0 0 24 24'
					width='14'
				>
					<rect height='14' rx='2.5' width='19' x='2.5' y='5'/>
					<path d='M2.5 10h19'/>
				</svg>
			</Show>
			<span class={css.number}>{props.number}</span>
			<span class={css.footer}>
				<Show when={!isMini()}>
					<span class={css.holder}>{props.holder}</span>
				</Show>
				<Show when={props.expiry}>
					<span class={cn(css.expiry, props.expired && css.expiryExpired)}>
						{props.expiry}
					</span>
				</Show>
			</span>
		</div>
	);
}
