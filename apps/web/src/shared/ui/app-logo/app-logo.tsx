import css from './app-logo.module.scss';

import { cn } from '@/shared/lib';

/** `md`: 36 px, the header. `lg`: 48 px, the sign-in panel (mockup `M-SignIn`, `D-SignIn`). */
export type AppLogoSize = 'lg' | 'md';

type Props = {
	class?: string;
	size?: AppLogoSize;
};

export function AppLogo(props: Props) {
	return <div class={cn(css.root, props.size === 'lg' && css.sizeLg, props.class)}>iF</div>;
}
