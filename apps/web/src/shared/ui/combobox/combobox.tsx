import css from './combobox.module.scss';

import { cn } from '@/shared/lib';

import {
	autoUpdate,
	computePosition,
	flip,
	hide,
	offset,
	shift,
	size
} from '@floating-ui/dom';
import { Check, ChevronDown, Search, X } from 'lucide-solid';
import type { Accessor, JSX } from 'solid-js';
import {
	createEffect,
	createMemo,
	createSignal,
	createUniqueId,
	For,
	onCleanup,
	Show
} from 'solid-js';
import { Portal } from 'solid-js/web';

const POPOVER_OFFSET = 4;
const POPOVER_VIEWPORT_PADDING = 8;

export type ComboboxOptionRenderState = {
	active: Accessor<boolean>;
	selected: Accessor<boolean>;
};

export type ComboboxProps<TOption> = {
	getOptionLabel: (option: TOption) => string;
	getOptionValue: (option: TOption) => string;
	onChange: (value: string | null, option: TOption | null) => void;
	options: readonly TOption[];
	value: string | null;
	class?: string;
	clearable?: boolean;
	disabled?: boolean;
	emptyText?: string;
	error?: string;
	getOptionDisabled?: (option: TOption) => boolean;
	getOptionSearchText?: (option: TOption) => string;
	hint?: string;
	label?: string;
	optional?: boolean;
	placeholder?: string;
	renderOption?: (option: TOption, state: ComboboxOptionRenderState) => JSX.Element;
	renderValue?: (option: TOption) => JSX.Element;
	searchPlaceholder?: string;
};

/**
 * Renders a searchable, keyboard-accessible single-select control.
 *
 * Domain-specific visuals are supplied through render props while selection,
 * filtering and accessibility remain centralized in the shared component.
 */
export function Combobox<TOption>(props: ComboboxProps<TOption>) {
	let rootElement: HTMLDivElement | undefined;
	let searchInput: HTMLInputElement | undefined;
	const controlId = createUniqueId();
	const labelId = createUniqueId();
	const listboxId = createUniqueId();
	const messageId = createUniqueId();
	const [controlElement, setControlElement] = createSignal<HTMLDivElement>();
	const [popoverElement, setPopoverElement] = createSignal<HTMLDivElement>();
	const [activeIndex, setActiveIndex] = createSignal(0);
	const [isOpen, setIsOpen] = createSignal(false);
	const [query, setQuery] = createSignal('');

	const selectedOption = createMemo(() => (
		props.options.find((option) => props.getOptionValue(option) === props.value)
	));
	const filteredOptions = createMemo(() => {
		const normalizedQuery = normalizeSearchValue(query());

		if (!normalizedQuery) {
			return [...props.options];
		}

		return props.options.filter((option) => {
			const searchText = props.getOptionSearchText?.(option)
				?? props.getOptionLabel(option);

			return normalizeSearchValue(searchText).includes(normalizedQuery);
		});
	});
	const hasMessage = () => Boolean(props.error || props.hint);

	const close = (): void => {
		setIsOpen(false);
		setQuery('');
		setActiveIndex(0);
	};

	const updatePopoverPosition = async (options: { closeIfReferenceHidden?: boolean } = {}): Promise<void> => {
		const reference = controlElement();
		const popover = popoverElement();

		if (!isOpen() || !reference || !popover) {
			return;
		}

		const position = await computePosition(reference, popover, {
			middleware: [
				offset(POPOVER_OFFSET),
				flip({
					altBoundary: true,
					crossAxis: false,
					fallbackPlacements: ['top-start'],
					fallbackStrategy: 'bestFit'
				}),
				shift({ altBoundary: true }),
				size({
					altBoundary: true,
					padding: POPOVER_VIEWPORT_PADDING,
					apply({ availableHeight, elements, rects }) {
						elements.floating.style.inlineSize = `${rects.reference.width}px`;
						elements.floating.style.maxBlockSize = `${availableHeight}px`;
					}
				}),
				hide({ strategy: 'referenceHidden' })
			],
			placement: 'bottom-start',
			strategy: 'fixed'
		});

		if (!isOpen() || popover !== popoverElement()) {
			return;
		}

		// `referenceHidden` means the trigger control is currently clipped out
		// of view. On a normal scroll (autoUpdate's ancestorScroll) that means
		// the popover lost its anchor and should close. But the on-screen
		// keyboard opening also clips the trigger — by covering it, not by the
		// user scrolling anything — and here the popover has already
		// repositioned itself into the space still visible above the keyboard,
		// so closing would fight the very keyboard-avoidance this update is
		// for (visible symptom: tapping the search field on a lower-positioned
		// combobox instantly closed it, right as the keyboard tried to open).
		if (position.middlewareData.hide?.referenceHidden && (options.closeIfReferenceHidden ?? true)) {
			close();
			return;
		}

		Object.assign(popover.style, {
			left: `${position.x}px`,
			top: `${position.y}px`,
			visibility: 'visible'
		});
	};

	const open = (): void => {
		if (props.disabled || isOpen()) {
			return;
		}

		setIsOpen(true);
		setQuery('');
		setActiveIndex(findInitialActiveIndex(filteredOptions(), props));
	};

	const selectOption = (option: TOption): void => {
		const optionValue = props.getOptionValue(option);

		if (props.getOptionDisabled?.(option)) {
			return;
		}

		if (optionValue !== props.value) {
			props.onChange(optionValue, option);
		}

		close();
	};

	const clearSelection = (): void => {
		if (props.value !== null) {
			props.onChange(null, null);
		}

		close();
	};

	const moveActiveOption = (direction: 1 | -1): void => {
		const options = filteredOptions();

		if (!options.length) {
			return;
		}

		let nextIndex = activeIndex();

		for (let visited = 0; visited < options.length; visited += 1) {
			nextIndex = (nextIndex + direction + options.length) % options.length;
			const option = options[nextIndex];

			if (
				option
				&& !props.getOptionDisabled?.(option)
				&& props.getOptionValue(option) !== props.value
			) {
				setActiveIndex(nextIndex);
				document.getElementById(getOptionId(listboxId, nextIndex))
					?.scrollIntoView({ block: 'nearest' });
				return;
			}
		}
	};

	const handleTriggerKeyDown: JSX.EventHandler<HTMLButtonElement, KeyboardEvent> = (event) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			open();
		}
	};

	const handleSearchKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (event) => {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			moveActiveOption(1);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			moveActiveOption(-1);
			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			const option = filteredOptions()[activeIndex()];

			if (option) {
				selectOption(option);
			}
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	};

	createEffect(() => {
		const options = filteredOptions();
		const currentOption = options[activeIndex()];

		if (
			currentOption
			&& !props.getOptionDisabled?.(currentOption)
			&& props.getOptionValue(currentOption) !== props.value
		) {
			return;
		}

		setActiveIndex(findInitialActiveIndex(options, props));
	});

	createEffect(() => {
		if (isOpen()) {
			requestAnimationFrame(() => searchInput?.focus());
		}
	});

	createEffect(() => {
		const reference = controlElement();
		const popover = popoverElement();

		if (!isOpen() || !reference || !popover) {
			return;
		}

		const handleUpdate = (): void => {
			void updatePopoverPosition();
		};
		// `elementResize`/`layoutShift` are disabled here because they fire on
		// the popover's OWN size changes — and the visualViewport handler below
		// changes that size (via `size()`'s maxBlockSize) on every keyboard
		// animation frame. That self-triggered resize would otherwise call
		// `handleUpdate` (default `closeIfReferenceHidden: true`) while the
		// trigger is still legitimately covered by the keyboard, closing the
		// popover a frame after it opened (symptom: search field tapped →
		// keyboard starts sliding up → popover instantly closes → focus is
		// lost → keyboard slides back down). `ancestorScroll`/`ancestorResize`
		// stay on: those only fire for a real scroll/resize of the page, which
		// should still close the popover when the trigger truly leaves view.
		const cleanup = autoUpdate(reference, popover, handleUpdate, {
			elementResize: false,
			layoutShift: false
		});

		// iOS Safari never fires `window`'s own `resize` when the on-screen
		// keyboard opens/closes — only the layout viewport is reported there,
		// and it doesn't shrink. `visualViewport` is what actually shrinks, and
		// it fires its own resize/scroll events, which `autoUpdate` above does
		// not listen to. Without this, the popover keeps the position/height it
		// computed before the keyboard appeared and ends up partly hidden
		// underneath it.
		const { visualViewport } = window;
		const handleVisualViewportChange = (): void => {
			void updatePopoverPosition({ closeIfReferenceHidden: false });
		};

		visualViewport?.addEventListener('resize', handleVisualViewportChange);
		visualViewport?.addEventListener('scroll', handleVisualViewportChange);
		onCleanup(() => {
			visualViewport?.removeEventListener('resize', handleVisualViewportChange);
			visualViewport?.removeEventListener('scroll', handleVisualViewportChange);
		});

		onCleanup(cleanup);
	});

	createEffect(() => {
		if (isOpen()) {
			const handlePointerDown = (event: PointerEvent): void => {
				if (
					rootElement
					&& event.target instanceof Node
					&& !rootElement.contains(event.target)
					&& !popoverElement()?.contains(event.target)
				) {
					close();
				}
			};

			document.addEventListener('pointerdown', handlePointerDown, true);
			onCleanup(() => document.removeEventListener('pointerdown', handlePointerDown, true));
		}
	});

	return (
		<div ref={rootElement} class={cn(css.field, props.class)}>
			<Show when={props.label}>
				<div class={css.labelRow} id={labelId}>
					<span class={css.label}>{props.label}</span>
					<Show when={props.optional}>
						<span class={css.optional}>необязательно</span>
					</Show>
				</div>
			</Show>

			<div
				ref={setControlElement}
				class={cn(
					css.control,
					isOpen() && css.controlOpen,
					props.disabled && css.controlDisabled,
					props.error && css.controlInvalid
				)}
			>
				<button
					aria-controls={listboxId}
					aria-describedby={hasMessage() ? messageId : undefined}
					aria-expanded={isOpen()}
					aria-haspopup='listbox'
					aria-invalid={Boolean(props.error) || undefined}
					aria-labelledby={props.label ? labelId : undefined}
					class={css.trigger}
					disabled={props.disabled}
					id={controlId}
					role='combobox'
					type='button'
					onClick={open}
					onKeyDown={handleTriggerKeyDown}
				>
					<span class={cn(css.value, !selectedOption() && css.placeholder)}>
						<Show
							fallback={props.placeholder ?? 'Выберите значение'}
							keyed
							when={selectedOption()}
						>
							{(option) => props.renderValue?.(option) ?? props.getOptionLabel(option)}
						</Show>
					</span>
					<ChevronDown aria-hidden='true' class={css.chevron} size={17}/>
				</button>

				<Show when={props.clearable !== false && props.value !== null && !props.disabled}>
					<button
						aria-label='Очистить выбранное значение'
						class={css.clearButton}
						type='button'
						onClick={clearSelection}
					>
						<X aria-hidden='true' size={15}/>
					</button>
				</Show>
			</div>

			<Show when={isOpen()}>
				<Portal>
					<div ref={setPopoverElement} class={css.popover}>
						<div class={css.searchControl}>
							<Search aria-hidden='true' size={16}/>
							<input
								ref={searchInput}
								aria-activedescendant={filteredOptions()[activeIndex()]
									? getOptionId(listboxId, activeIndex())
									: undefined}
								aria-controls={listboxId}
								aria-label={`Поиск: ${props.label ?? 'варианты'}`}
								autocomplete='off'
								placeholder={props.searchPlaceholder ?? 'Поиск'}
								value={query()}
								onInput={(event) => setQuery(event.currentTarget.value)}
								onKeyDown={handleSearchKeyDown}
							/>
						</div>

						<div class={css.options} id={listboxId} role='listbox'>
							<Show
								fallback={<div class={css.empty}>{props.emptyText ?? 'Ничего не найдено'}</div>}
								when={filteredOptions().length > 0}
							>
								<For each={filteredOptions()}>
									{(option, index) => {
										const optionValue = () => props.getOptionValue(option);
										const isSelected = () => optionValue() === props.value;
										const isDisabled = () => Boolean(props.getOptionDisabled?.(option));
										const isActive = () => activeIndex() === index();
										const state: ComboboxOptionRenderState = {
											active: isActive,
											selected: isSelected
										};

										return (
											<button
												aria-disabled={isDisabled() || undefined}
												aria-selected={isSelected()}
												class={cn(
													css.option,
													isActive() && css.optionActive,
													isSelected() && css.optionSelected,
													isDisabled() && css.optionDisabled
												)}
												id={getOptionId(listboxId, index())}
												role='option'
												tabIndex={-1}
												type='button'
												onClick={() => selectOption(option)}
												onPointerMove={() => {
													if (!isDisabled() && !isSelected()) {
														setActiveIndex(index());
													}
												}}
											>
												<span class={css.optionContent}>
													{props.renderOption?.(option, state)
														?? props.getOptionLabel(option)}
												</span>
												<Show when={isSelected()}>
													<Check aria-hidden='true' class={css.check} size={17}/>
												</Show>
											</button>
										);
									}}
								</For>
							</Show>
						</div>
					</div>
				</Portal>
			</Show>

			<Show when={hasMessage()}>
				<div
					aria-live={props.error ? 'polite' : undefined}
					class={cn(css.message, props.error && css.messageError)}
					id={messageId}
				>
					{props.error ?? props.hint}
				</div>
			</Show>
		</div>
	);
}

function findInitialActiveIndex<TOption>(
	options: readonly TOption[],
	props: ComboboxProps<TOption>
): number {
	const availableIndex = options.findIndex((option) => (
		!props.getOptionDisabled?.(option)
		&& props.getOptionValue(option) !== props.value
	));

	return Math.max(availableIndex, 0);
}

function getOptionId(listboxId: string, index: number): string {
	return `${listboxId}-option-${index}`;
}

function normalizeSearchValue(value: string): string {
	return value
		.trim()
		.replace(/\s+/g, ' ')
		.toLocaleLowerCase('ru-BY')
		.replace(/ё/g, 'е');
}
