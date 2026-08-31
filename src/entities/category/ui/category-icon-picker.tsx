import css from './category-icon-picker.module.scss';

import { cn } from '~/shared/lib';

import {
	CATEGORY_ICON_IDS,
	resolveCategoryIconId,
	type CategoryIconId
} from '../model/icons';

import { For, Show } from 'solid-js';

import { CategoryIcon } from './category-icon';

/**
 * Props for the curated category icon grid picker.
 */
export type CategoryIconPickerProps = {
	value: string;
	onChange: (value: CategoryIconId) => void;
	class?: string;
	label?: string;
};

/**
 * Grid of whitelist Lucide icons for category create/edit forms.
 */
export function CategoryIconPicker(props: CategoryIconPickerProps) {
	const selectedIcon = () => resolveCategoryIconId(props.value);

	return (
		<div class={cn(css.root, props.class)}>
			<Show when={props.label}>
				<div class={css.label}>{props.label}</div>
			</Show>
			<div class={css.options} role='listbox' aria-label={props.label ?? 'Иконка категории'}>
				<For each={[...CATEGORY_ICON_IDS]}>
					{(iconId) => {
						const isActive = () => selectedIcon() === iconId;

						return (
							<button
								aria-label={iconId}
								aria-selected={isActive()}
								class={cn(css.option, isActive() && css.optionActive)}
								role='option'
								type='button'
								onClick={() => props.onChange(iconId)}
							>
								<CategoryIcon icon={iconId} size={18}/>
							</button>
						);
					}}
				</For>
			</div>
		</div>
	);
}
