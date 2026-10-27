import css from './bottom-navigation.module.scss';

import { cn, useTextInputFocus } from '@/shared/lib';

import { A } from '@solidjs/router';
import type { LucideIcon } from 'lucide-solid';
import { For } from 'solid-js';
import { Portal } from 'solid-js/web';

export type BottomNavigationItem = {
	href: string;
	label: string;
	icon: LucideIcon;
};

export type BottomNavigationProps = {
	items: readonly [BottomNavigationItem, BottomNavigationItem, BottomNavigationItem, BottomNavigationItem, BottomNavigationItem];
	'aria-label'?: string;
};

/** Five equal phone navigation cells. The shell owns the routes; the router owns the current page. */
export function BottomNavigation(props: BottomNavigationProps) {
	const isKeyboardOpen = useTextInputFocus();

	return (
		<Portal>
			<nav
				aria-label={props['aria-label'] ?? 'Основная навигация'}
				class={cn(css.root, isKeyboardOpen() && css.hidden)}
			>
				<For each={props.items}>
					{(item) => (
						<A end activeClass={css.active} class={css.link} href={item.href}>
							<item.icon aria-hidden='true' size={20}/>
							<span>{item.label}</span>
						</A>
					)}
				</For>
			</nav>
		</Portal>
	);
}
