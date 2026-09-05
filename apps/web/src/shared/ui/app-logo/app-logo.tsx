import css from './app-logo.module.scss';

import { cn } from '@/shared/lib';

export function AppLogo(props: { class?: string }) {
	return <div class={cn(css.root, props.class)}>iF</div>;
}
