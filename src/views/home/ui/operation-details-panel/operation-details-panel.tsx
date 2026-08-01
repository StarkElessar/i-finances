import css from './operation-details-panel.module.scss';

import { createEffect, createSignal, createUniqueId, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

import { OperationDetailsForm } from './operation-details-form';
import type { OperationDetailsPanelProps } from './types';

import { cn } from '~/shared/lib';

const CLOSE_ANIMATION_MS = 180;

/**
 * Renders the controlled transaction editor as an in-flow desktop panel or a
 * portal-backed mobile drawer.
 */
export function OperationDetailsPanel(props: OperationDetailsPanelProps) {
	let closeAnimationTimer: number | undefined;
	let panelElement: HTMLElement | undefined;
	let previousFocusElement: HTMLElement | undefined;
	let wasOpen = false;
	const titleId = createUniqueId();
	const [isPresent, setIsPresent] = createSignal(props.open);
	const [panelState, setPanelState] = createSignal<'open' | 'closing'>(
		props.open ? 'open' : 'closing'
	);

	const clearCloseTimer = (): void => {
		if (closeAnimationTimer !== undefined) {
			window.clearTimeout(closeAnimationTimer);
			closeAnimationTimer = undefined;
		}
	};

	const close = (): void => {
		props.onOpenChange(false);
	};

	createEffect(() => {
		if (props.open) {
			clearCloseTimer();
			setIsPresent(true);
			setPanelState('open');
			props.onPresenceChange(true);

			if (!wasOpen) {
				previousFocusElement = document.activeElement instanceof HTMLElement
					? document.activeElement
					: undefined;
			}
		}
		else if (isPresent()) {
			setPanelState('closing');
			clearCloseTimer();
			closeAnimationTimer = window.setTimeout(() => {
				setIsPresent(false);
				props.onPresenceChange(false);
				previousFocusElement?.focus();
				closeAnimationTimer = undefined;
			}, CLOSE_ANIMATION_MS);
		}

		wasOpen = props.open;
		onCleanup(clearCloseTimer);
	});

	createEffect(() => {
		if (isPresent() && props.mobile) {
			const previousOverflow = document.body.style.overflow;

			document.body.style.overflow = 'hidden';
			onCleanup(() => {
				document.body.style.overflow = previousOverflow;
			});
		}
	});

	createEffect(() => {
		if (isPresent()) {
			const handleKeyDown = (event: KeyboardEvent): void => {
				if (event.defaultPrevented) {
					return;
				}

				const eventBelongsToPanel = event.target instanceof Node
					&& Boolean(panelElement?.contains(event.target));

				if (event.key === 'Escape' && eventBelongsToPanel) {
					event.preventDefault();
					close();
					return;
				}

				if (
					event.key === 'Tab'
					&& props.mobile
					&& panelElement
					&& eventBelongsToPanel
				) {
					trapFocus(panelElement, event);
				}
			};

			document.addEventListener('keydown', handleKeyDown);
			onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
		}
	});

	const panel = () => (
		<aside
			ref={panelElement}
			aria-labelledby={titleId}
			aria-modal={props.mobile ? 'true' : undefined}
			class={cn(css.panel, props.mobile ? css.panelMobile : css.panelDesktop)}
			data-state={panelState()}
			role={props.mobile ? 'dialog' : undefined}
			tabIndex={-1}
		>
			<OperationDetailsForm
				account={props.account}
				categories={props.categories}
				contacts={props.contacts}
				error={props.error}
				fieldErrors={props.fieldErrors}
				loading={props.loading}
				mode={props.mode}
				operation={props.operation}
				titleId={titleId}
				onClose={close}
				onDelete={props.onDelete}
				onRecalculateRate={props.onRecalculateRate}
				onSubmit={props.onSubmit}
			/>
		</aside>
	);

	return (
		<Show when={isPresent()}>
			<Show fallback={panel()} when={props.mobile}>
				<Portal>
					<button
						aria-label='Закрыть панель операции'
						class={css.backdrop}
						data-state={panelState()}
						type='button'
						onClick={close}
					/>
					{panel()}
				</Portal>
			</Show>
		</Show>
	);
}

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
	const focusableElements = Array.from(container.querySelectorAll<HTMLElement>(
		'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
	));

	if (focusableElements.length === 0) {
		return;
	}

	const firstElement = focusableElements[0];
	const lastElement = focusableElements[focusableElements.length - 1];

	if (event.shiftKey && document.activeElement === firstElement) {
		event.preventDefault();
		lastElement.focus();
	}
	else if (!event.shiftKey && document.activeElement === lastElement) {
		event.preventDefault();
		firstElement.focus();
	}
}
