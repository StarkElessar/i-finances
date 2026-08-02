import css from './keyword-input.module.scss';

import { cn } from '~/shared/lib';

import {
	normalizeCategoryIdentity,
	normalizeCategoryKeyword
} from '~/entities/category';

import type { JSX } from 'solid-js';
import { createEffect, createSignal, For, Show } from 'solid-js';

export type KeywordInputProps = {
	value: readonly string[];
	onChange: (value: string[]) => void;
	class?: string;
	error?: string;
	hint?: string;
	label?: string;
};

function normalizeKeyword(value: string): string | undefined {
	const keyword = normalizeCategoryKeyword(value);

	return keyword || undefined;
}

export function KeywordInput(props: KeywordInputProps) {
	const [inputValue, setInputValue] = createSignal('');
	const [selectedKeywordIndex, setSelectedKeywordIndex] = createSignal<number | null>(null);

	createEffect(() => {
		const selectedIndex = selectedKeywordIndex();

		if (selectedIndex !== null && selectedIndex >= props.value.length) {
			setSelectedKeywordIndex(null);
		}
	});

	const commitKeywords = (rawKeywords: readonly string[]) => {
		const nextKeywords = [...props.value];

		for (const rawKeyword of rawKeywords) {
			const keyword = normalizeKeyword(rawKeyword);

			if (!keyword) {
				continue;
			}

			const keywordIdentity = normalizeCategoryIdentity(keyword);
			const isDuplicate = nextKeywords.some((currentKeyword) => (
				normalizeCategoryIdentity(currentKeyword) === keywordIdentity
			));

			if (!isDuplicate) {
				nextKeywords.push(keyword);
			}
		}

		props.onChange(nextKeywords);
	};

	const commitInputValue = () => {
		const value = inputValue();

		if (!value.trim()) {
			return;
		}

		commitKeywords([value]);
		setInputValue('');
		setSelectedKeywordIndex(null);
	};

	const removeKeyword = (index: number) => {
		props.onChange(props.value.filter((_, currentIndex) => currentIndex !== index));
		setSelectedKeywordIndex(null);
	};

	const handleInput: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
		const value = event.currentTarget.value;
		const parts = value.split(',');

		setSelectedKeywordIndex(null);

		if (parts.length === 1) {
			setInputValue(value);
			return;
		}

		commitKeywords(parts.slice(0, -1));
		setInputValue(parts.at(-1) ?? '');
	};

	const handleKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (event) => {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			commitInputValue();
			return;
		}

		if (event.key !== 'Backspace') {
			setSelectedKeywordIndex(null);
			return;
		}

		if (inputValue()) {
			setSelectedKeywordIndex(null);
			return;
		}

		const selectedIndex = selectedKeywordIndex();

		if (selectedIndex === null) {
			if (props.value.length > 0) {
				event.preventDefault();
				setSelectedKeywordIndex(props.value.length - 1);
			}

			return;
		}

		event.preventDefault();
		removeKeyword(selectedIndex);
	};

	return (
		<div class={cn(css.root, props.class)}>
			<Show when={props.label}>
				<div class={css.label}>{props.label}</div>
			</Show>
			<div class={css.control}>
				<For each={props.value}>
					{(keyword, index) => (
						<span class={cn(css.chip, selectedKeywordIndex() === index() && css.chipSelected)}>
							<span>{keyword}</span>
							<button
								aria-label={`Удалить ключевое слово ${keyword}`}
								class={css.chipRemove}
								type='button'
								onClick={() => removeKeyword(index())}
							>
								<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3'>
									<path d='M6 6l12 12M18 6L6 18'/>
								</svg>
							</button>
						</span>
					)}
				</For>
				<input
					class={css.input}
					placeholder={props.value.length > 0 ? '' : 'Например, аптека'}
					type='text'
					value={inputValue()}
					onInput={handleInput}
					onKeyDown={handleKeyDown}
				/>
			</div>
			<Show when={props.error || props.hint}>
				<div class={cn(css.message, props.error && css.messageError)}>
					{props.error ?? props.hint}
				</div>
			</Show>
		</div>
	);
}
