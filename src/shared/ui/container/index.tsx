import css from './container.module.scss';

import type { JSX } from 'solid-js';

import { cn } from '~/shared/lib';

export function Container(props: {
    children: JSX.Element;
    class?: string;
}) {
    return (
        <div class={cn(css.container, props.class)}>
            {props.children}
        </div>
    );
}
