import css from './container.module.scss';

import { cn } from '~/shared/lib';

import type { JSX } from 'solid-js';

export function Container(props: {
	children: JSX.Element;
	class?: string;
	useMaxSize?: boolean;
}) {
	return (
		<div class={cn(css.container, props.useMaxSize && css.maxSize, props.class)}>
			{props.children}
		</div>
	);
}
