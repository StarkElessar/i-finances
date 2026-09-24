import css from './reference-multiselect.module.scss';

import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui';

import { isAllSelected, toggleAll, toggleOne } from '@/views/statistics/lib/selection';

import { ChevronDown, X } from 'lucide-solid';
import { createEffect, createMemo, createSignal, For, type JSX, onCleanup, Show } from 'solid-js';

const CHIP_LIMIT = 8;

export type ReferenceOption = {
	id: string;
	isArchived: boolean;
	name: string;
	periodTotalMinor: number;
};

export type ReferenceMultiselectProps = {
	colorOf: (id: string) => string;
	formatAmount: (minor: number) => string;
	noun: 'category' | 'contact';
	onChange: (ids: string[]) => void;
	options: readonly ReferenceOption[];
	selectedIds: readonly string[];
};

const NOUNS = {
	category: { all: 'Все категории', trigger: 'Категории' },
	contact: { all: 'Все контакты', trigger: 'Контакты' }
} as const;

export function ReferenceMultiselect(props: ReferenceMultiselectProps): JSX.Element {
	let rootElement: HTMLDivElement | undefined;
	let chipsElement: HTMLDivElement | undefined;
	let searchInput: HTMLInputElement | undefined;
	let allCheckbox: HTMLInputElement | undefined;
	const [isOpen, setIsOpen] = createSignal(false);
	const [query, setQuery] = createSignal('');
	const allIds = createMemo(() => props.options.map((option) => option.id));
	const selectedSet = createMemo(() => new Set(props.selectedIds));
	const allSelected = createMemo(() => isAllSelected(props.selectedIds, allIds()));
	const filteredOptions = createMemo(() => {
		const needle = query().trim().toLowerCase();

		return needle === '' ? props.options : props.options.filter((option) => option.name.toLowerCase().includes(needle));
	});
	const namesById = createMemo(() => new Map(props.options.map((option) => [option.id, option.name])));
	const visibleChips = createMemo(() => props.selectedIds.slice(0, CHIP_LIMIT));
	const hiddenChipCount = createMemo(() => Math.max(0, props.selectedIds.length - CHIP_LIMIT));

	const open = () => {
		setIsOpen(true);
		queueMicrotask(() => searchInput?.focus());
	};
	const close = () => {
		setIsOpen(false);
		setQuery('');
	};
	const handlePointerDown = (event: PointerEvent) => {
		const target = event.target as Node;

		if (!rootElement?.contains(target) && !chipsElement?.contains(target)) {
			close();
		}
	};
	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			close();
		}
	};

	createEffect(() => {
		if (allCheckbox !== undefined) {
			allCheckbox.indeterminate = props.selectedIds.length > 0 && !allSelected();
		}
	});
	createEffect(() => {
		if (!isOpen()) {
			return;
		}

		// pointerdown, not click: re-rendering the list detaches the click target before it bubbles here.
		document.addEventListener('pointerdown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown);
		onCleanup(() => {
			document.removeEventListener('pointerdown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown);
		});
	});

	return (
		<div class={css.root}>
			<div class={css.anchor} ref={rootElement}>
				<Button
					aria-expanded={isOpen()}
					aria-haspopup='listbox'
					endIcon={<ChevronDown aria-hidden='true' size={16}/>}
					onClick={() => (isOpen() ? close() : open())}
					size='sm'
					variant='secondary'
				>
					<span>
						{NOUNS[props.noun].trigger}: <b>{props.selectedIds.length > 0 ? props.selectedIds.length : 'не выбраны'}</b>
					</span>
				</Button>
				<Show when={isOpen()}>
					<div class={css.popover}>
						<input
							aria-label='Поиск'
							class={css.search}
							onInput={(event) => setQuery(event.currentTarget.value)}
							placeholder='Поиск…'
							ref={searchInput}
							type='search'
							value={query()}
						/>
						<div class={css.list} role='listbox' aria-multiselectable='true'>
							<Show when={query().trim() === '' && props.options.length > 0}>
								<label class={cn(css.option, css.optionAll)}>
									<input
										checked={allSelected()}
										onChange={() => props.onChange(toggleAll(props.selectedIds, allIds()))}
										ref={allCheckbox}
										type='checkbox'
									/>
									<span>Все</span>
									<small class={css.amount}>{props.options.length}</small>
								</label>
							</Show>
							<For each={filteredOptions()} fallback={<p class={css.empty}>Ничего не найдено</p>}>
								{(option) => (
									<label class={css.option}>
										<input
											checked={selectedSet().has(option.id)}
											onChange={() => props.onChange(toggleOne(props.selectedIds, option.id))}
											type='checkbox'
										/>
										<span class={css.optionName}>
											{option.name}
											<Show when={option.isArchived}>
												<small class={css.archived}>архив</small>
											</Show>
										</span>
										<small class={css.amount}>
											{option.periodTotalMinor > 0 ? props.formatAmount(option.periodTotalMinor) : '—'}
										</small>
									</label>
								)}
							</For>
						</div>
						<div class={css.footer}>
							<span>выбрано {props.selectedIds.length} из {props.options.length}</span>
							<Button onClick={() => props.onChange([])} size='sm' variant='ghost'>
								<span>Очистить</span>
							</Button>
						</div>
					</div>
				</Show>
			</div>
			<div class={css.chips} ref={chipsElement}>
				<Show
					when={allSelected()}
					fallback={(
						<>
							<For each={visibleChips()}>
								{(id) => (
									<span class={css.chip}>
										<span class={css.dot} style={{ 'background-color': props.colorOf(id) }}/>
										{namesById().get(id)}
										<button
											aria-label={`Убрать ${namesById().get(id) ?? ''}`}
											class={css.chipRemove}
											onClick={() => props.onChange(toggleOne(props.selectedIds, id))}
											type='button'
										>
											<X aria-hidden='true' size={14}/>
										</button>
									</span>
								)}
							</For>
							<Show when={hiddenChipCount() > 0}>
								<button class={cn(css.chip, css.chipMore)} onClick={open} type='button'>
									+ ещё {hiddenChipCount()}
								</button>
							</Show>
						</>
					)}
				>
					<span class={css.chip}>
						{NOUNS[props.noun].all} ({props.selectedIds.length})
						<button aria-label='Снять все' class={css.chipRemove} onClick={() => props.onChange([])} type='button'>
							<X aria-hidden='true' size={14}/>
						</button>
					</span>
				</Show>
			</div>
		</div>
	);
}
