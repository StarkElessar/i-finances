import css from './color-picker.module.scss';

import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';

import { AccentColor, cn } from '~/shared/lib';

export type ColorPickerOption = string | {
    label?: string;
    value: string;
};

export type ColorPickerProps = {
    value: string;
    onChange: (value: string) => void;
    class?: string;
    customLabel?: string;
    label?: string;
    options?: readonly ColorPickerOption[];
};

const DEFAULT_OPTIONS = AccentColor.values();

function normalizeColorOption(option: ColorPickerOption): {
    label: string;
    value: string;
} {
    if (typeof option === 'string') {
        return {
            label: option,
            value: option
        };
    }

    return {
        label: option.label ?? option.value,
        value: option.value
    };
}

function getColorStyle(color: string): JSX.CSSProperties {
    return {
        '--color-picker-value': color
    };
}

export function ColorPicker(props: ColorPickerProps) {
    const options = () => (props.options ?? DEFAULT_OPTIONS).map(normalizeColorOption);
    const isCustomColorActive = () => !options().some((option) => option.value === props.value);

    const handleCustomColorInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        props.onChange(event.currentTarget.value);
    };

    return (
        <div class={cn(css.root, props.class)}>
            <Show when={props.label}>
                <div class={css.label}>{props.label}</div>
            </Show>
            <div class={css.options}>
                <For each={options()}>
                    {(option) => (
                        <button
                            aria-label={`Выбрать цвет ${option.label}`}
                            aria-pressed={props.value === option.value}
                            class={cn(css.swatch, props.value === option.value && css.swatchActive)}
                            style={getColorStyle(option.value)}
                            type='button'
                            onClick={() => props.onChange(option.value)}
                        />
                    )}
                </For>
                <label
                    class={cn(
                        css.customColor,
                        isCustomColorActive() && css.customColorActive
                    )}
                >
                    <span>{props.customLabel ?? 'Свой'}</span>
                    <input
                        aria-label='Выбрать свой цвет'
                        class={css.customInput}
                        type='color'
                        value={props.value}
                        onInput={handleCustomColorInput}
                    />
                </label>
            </div>
        </div>
    );
}
