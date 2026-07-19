import css from './button.module.scss';

import type { JSX } from 'solid-js';
import { children, Show, splitProps } from 'solid-js';

import { cn } from '~/shared/lib';

/**
 * Visual hierarchy variants supported by the button.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Control heights shared with inputs and other interactive elements.
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button properties extending the native SolidJS button contract.
 */
export type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'class'> & {
    children: JSX.Element;
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    fullWidth?: boolean;
    iconOnly?: boolean;
    startIcon?: JSX.Element;
    endIcon?: JSX.Element;
    class?: string;
};

const variantClassByVariant: Record<ButtonVariant, string> = {
    primary: css.variantPrimary,
    secondary: css.variantSecondary,
    ghost: css.variantGhost,
    danger: css.variantDanger
};

const sizeClassBySize: Record<ButtonSize, string> = {
    sm: css.sizeSm,
    md: css.sizeMd,
    lg: css.sizeLg
};

/**
 * Renders an accessible action control with consistent sizing and states.
 *
 * Icon-only usage must include an `aria-label`.
 */
export function Button(props: ButtonProps) {
    const [local, buttonProps] = splitProps(props, [
        'children',
        'variant',
        'size',
        'loading',
        'fullWidth',
        'iconOnly',
        'startIcon',
        'endIcon',
        'class',
        'type',
        'disabled'
    ]);

    /**
     * Resolves the optional leading icon without evaluating its JSX getter twice.
     */
    const startIcon = children(() => local.startIcon);

    /**
     * Resolves the optional trailing icon without evaluating its JSX getter twice.
     */
    const endIcon = children(() => local.endIcon);

    return (
        <button
            {...buttonProps}
            aria-busy={local.loading || undefined}
            class={cn(
                css.button,
                variantClassByVariant[local.variant ?? 'primary'],
                sizeClassBySize[local.size ?? 'md'],
                local.fullWidth && css.fullWidth,
                local.iconOnly && css.iconOnly,
                local.loading && css.loading,
                local.class
            )}
            disabled={Boolean(local.disabled || local.loading)}
            type={local.type ?? 'button'}
        >
            <span class={css.content}>
                <Show keyed when={startIcon()}>
                    {(icon) => <span aria-hidden='true' class={css.icon}>{icon}</span>}
                </Show>
                <span class={css.label}>{local.children}</span>
                <Show keyed when={endIcon()}>
                    {(icon) => <span aria-hidden='true' class={css.icon}>{icon}</span>}
                </Show>
            </span>
            <Show when={local.loading}>
                <span aria-hidden='true' class={css.spinner}/>
            </Show>
        </button>
    );
}
