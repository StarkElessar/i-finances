import css from './page-frame.module.scss';

import { Container } from '@/shared/ui/container';

import type { JSX } from 'solid-js';

export type PageFrameProps = {
	children: JSX.Element;
	description: string;
	eyebrow: string;
	title: string;
};

export function PageFrame(props: PageFrameProps) {
	return (
		<div class={css.page}>
			<Container useMaxSize>
				<header class={css.header}>
					<p class={css.eyebrow}>{props.eyebrow}</p>
					<h1 class={css.title}>{props.title}</h1>
					<p class={css.description}>{props.description}</p>
				</header>
				<div class={css.content}>{props.children}</div>
			</Container>
		</div>
	);
}
