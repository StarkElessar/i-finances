import css from './switch.module.scss';

import type { JSX } from 'solid-js';
import { splitProps } from 'solid-js';

import { cn } from '~/shared/lib';

export type SwitchProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'children' | 'class' | 'type'> & {
    class?: string;
    controlClass?: string;
    inputClass?: string;
};

export function Switch(props: SwitchProps) {
    const [local, inputProps] = splitProps(props, [
        'class',
        'controlClass',
        'inputClass'
    ]);

    return (
        <span class={cn(css.root, local.class)}>
            <input
                {...inputProps}
                class={cn(css.input, local.inputClass)}
                role='switch'
                type='checkbox'
            />
            <span aria-hidden='true' class={cn(css.control, local.controlClass)}/>
        </span>
    );
}
