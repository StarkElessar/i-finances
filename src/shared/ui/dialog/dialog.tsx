import css from './dialog.module.scss';

import type { JSX } from 'solid-js';
import {
	createContext,
	createEffect,
	createSignal,
	createUniqueId,
	onCleanup,
	Show,
	splitProps,
	useContext
} from 'solid-js';
import { Dynamic, Portal } from 'solid-js/web';

import type {
	DialogActionIntent, DialogActionProps, DialogBodyProps, DialogCloseProps, DialogContentProps, DialogContextValue,
	DialogDescriptionProps, DialogFooterProps, DialogHeaderProps, DialogKickerProps, DialogRenderProps, DialogRootProps, DialogState,
	DialogTitleProps
} from './types';

import { cn } from '~/shared/lib';
import type { ButtonVariant } from '~/shared/ui/button';
import { Button } from '~/shared/ui/button';

const CLOSE_ANIMATION_MS = 180;

const DialogContext = createContext<DialogContextValue>();

/**
 * Calls a Solid event handler regardless of whether it was passed directly or as a bound tuple.
 */
function callEventHandler<TElement extends HTMLElement, TEvent extends Event>(
	handler: JSX.EventHandlerUnion<TElement, TEvent> | undefined,
	event: Parameters<JSX.EventHandler<TElement, TEvent>>[0]
): void {
	if (!handler) {
		return;
	}

	if (typeof handler === 'function') {
		handler(event);
		return;
	}

	handler[0](handler[1], event);
}

/**
 * Reads the nearest dialog provider or throws a clear composition error.
 */
function useDialogContext(componentName: string): DialogContextValue {
	const context = useContext(DialogContext);

	if (!context) {
		throw new Error(`${componentName} must be used inside Dialog.Root.`);
	}

	return context;
}

/**
 * Resolves JSX children or render props against the current dialog API.
 */
function resolveDialogChildren(
	children: DialogRootProps['children'],
	dialog: DialogRenderProps
): JSX.Element {
	if (typeof children === 'function') {
		return children(dialog);
	}

	return children;
}

/**
 * Resolves the default visual variant for a dialog action intent.
 */
function resolveActionVariant(intent: DialogActionIntent): ButtonVariant {
	if (intent === 'cancel') {
		return 'secondary';
	}

	if (intent === 'danger') {
		return 'danger';
	}

	return 'primary';
}

/**
 * Provides portal rendering, presence state and close behavior for dialogs.
 */
function DialogRoot(props: DialogRootProps) {
	let closeAnimationTimer: number | undefined;
	let contentElement: HTMLElement | undefined;
	let previousFocusElement: HTMLElement | undefined;
	let wasOpen = false;
	const contentId = createUniqueId();
	const [internalOpen, setInternalOpen] = createSignal(Boolean(props.defaultOpen));
	const [isPresent, setIsPresent] = createSignal(Boolean(props.open ?? props.defaultOpen));
	const [state, setState] = createSignal<DialogState>((props.open ?? props.defaultOpen) ? 'open' : 'closing');
	const [titleId, setTitleId] = createSignal<string>();
	const [descriptionId, setDescriptionId] = createSignal<string>();

	const isOpen = () => props.open ?? internalOpen();

	const shouldCloseOnBackdropClick = () => props.closeOnBackdropClick ?? true;

	const shouldCloseOnEscape = () => props.closeOnEscape ?? true;

	const clearCloseTimer = (): void => {
		if (closeAnimationTimer !== undefined) {
			window.clearTimeout(closeAnimationTimer);
			closeAnimationTimer = undefined;
		}
	};

	const setOpen = (open: boolean): void => {
		if (props.open === undefined) {
			setInternalOpen(open);
		}

		props.onOpenChange?.(open);
	};

	const open = (): void => {
		setOpen(true);
	};

	const close = (): void => {
		setOpen(false);
	};

	const setContentElement = (element: HTMLElement): void => {
		contentElement = element;
	};

	const handleBackdropClick = (): void => {
		if (shouldCloseOnBackdropClick()) {
			close();
		}
	};

	const focusContent = (): void => {
		setTimeout(
			() => {
				if (contentElement && !contentElement.contains(document.activeElement)) {
					contentElement.focus();
				}
			},
			0
		);
	};

	const restoreFocus = (): void => {
		setTimeout(() => previousFocusElement?.focus(), CLOSE_ANIMATION_MS);
	};

	createEffect(() => {
		const open = isOpen();

		if (open) {
			clearCloseTimer();
			setIsPresent(true);
			setState('open');

			if (!wasOpen) {
				previousFocusElement = document.activeElement instanceof HTMLElement
					? document.activeElement
					: undefined;
				focusContent();
			}
		}

		if (!open && isPresent()) {
			setState('closing');
			clearCloseTimer();
			closeAnimationTimer = window.setTimeout(() => {
				setIsPresent(false);
				closeAnimationTimer = undefined;
			}, CLOSE_ANIMATION_MS);

			if (wasOpen) {
				restoreFocus();
			}
		}

		wasOpen = open;
		onCleanup(clearCloseTimer);
	});

	createEffect(() => {
		if (isOpen() && shouldCloseOnEscape()) {
			const handleKeyDown = (event: KeyboardEvent): void => {
				if (event.key === 'Escape') {
					event.preventDefault();
					close();
				}
			};

			document.addEventListener('keydown', handleKeyDown);
			onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
		}
	});

	const dialog: DialogRenderProps = {
		close,
		isOpen,
		isPresent,
		open,
		setOpen
	};

	const context: DialogContextValue = {
		...dialog,
		contentId,
		descriptionId,
		setContentElement,
		setDescriptionId,
		setTitleId,
		state,
		titleId
	};

	return (
		<DialogContext.Provider value={context}>
			<Show when={isPresent()}>
				<Portal mount={props.mount}>
					<div class={cn(css.root, props.class)} data-state={state()}>
						<button
							aria-label='Закрыть диалог'
							class={css.backdrop}
							onClick={handleBackdropClick}
							type='button'
						/>
						<div class={css.viewport}>
							{resolveDialogChildren(props.children, dialog)}
						</div>
					</div>
				</Portal>
			</Show>
		</DialogContext.Provider>
	);
}

/**
 * Renders the dialog panel and wires accessible dialog metadata.
 */
function DialogContent(props: DialogContentProps) {
	const context = useDialogContext('Dialog.Content');
	const [local, contentProps] = splitProps(props, [
		'as',
		'children',
		'class',
		'role',
		'tabIndex',
		'aria-describedby',
		'aria-labelledby'
	]);

	return (
		<Dynamic
			{...contentProps}
			ref={context.setContentElement}
			aria-describedby={local['aria-describedby'] ?? context.descriptionId()}
			aria-labelledby={local['aria-labelledby'] ?? context.titleId()}
			aria-modal='true'
			class={cn(css.content, local.class)}
			data-state={context.state()}
			id={context.contentId}
			role={local.role ?? 'dialog'}
			tabIndex={local.tabIndex ?? -1}
			component={local.as ?? 'section'}
		>
			{local.children}
		</Dynamic>
	);
}

/**
 * Renders dialog heading chrome with an integrated close control.
 */
function DialogHeader(props: DialogHeaderProps) {
	return (
		<header class={cn(css.header, props.class)}>
			<div class={css.headerContent}>{props.children}</div>
			<Show when={!props.hideCloseButton}>
				<DialogClose label={props.closeLabel}/>
			</Show>
		</header>
	);
}

/**
 * Renders short metadata above the dialog title.
 */
function DialogKicker(props: DialogKickerProps) {
	return <div class={cn(css.kicker, props.class)}>{props.children}</div>;
}

/**
 * Renders and registers the accessible dialog title.
 */
function DialogTitle(props: DialogTitleProps) {
	const context = useDialogContext('Dialog.Title');
	const generatedId = createUniqueId();
	const id = () => props.id ?? generatedId;

	createEffect(() => {
		context.setTitleId(id());
		onCleanup(() => context.setTitleId(undefined));
	});

	return <h2 class={cn(css.title, props.class)} id={id()}>{props.children}</h2>;
}

/**
 * Renders and registers the accessible dialog description.
 */
function DialogDescription(props: DialogDescriptionProps) {
	const context = useDialogContext('Dialog.Description');
	const generatedId = createUniqueId();
	const id = () => props.id ?? generatedId;

	createEffect(() => {
		context.setDescriptionId(id());
		onCleanup(() => context.setDescriptionId(undefined));
	});

	return <p class={cn(css.description, props.class)} id={id()}>{props.children}</p>;
}

/**
 * Renders the main scrollable dialog body area.
 */
function DialogBody(props: DialogBodyProps) {
	return <div class={cn(css.body, props.class)}>{props.children}</div>;
}

/**
 * Renders dialog action chrome and supports render props.
 */
function DialogFooter(props: DialogFooterProps) {
	const context = useDialogContext('Dialog.Footer');

	return (
		<footer class={cn(css.footer, props.class)}>
			{resolveDialogChildren(props.children, context)}
		</footer>
	);
}

/**
 * Renders an action button inside a dialog footer.
 */
function DialogAction(props: DialogActionProps) {
	const context = useDialogContext('Dialog.Action');
	const [local, buttonProps] = splitProps(props, [
		'closeOnClick',
		'intent',
		'onClick',
		'type',
		'variant'
	]);
	const intent = () => local.intent ?? 'confirm';
	const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
		callEventHandler(local.onClick, event);

		if (!event.defaultPrevented && local.closeOnClick) {
			context.close();
		}
	};

	return (
		<Button
			{...buttonProps}
			type={local.type ?? (intent() === 'confirm' ? 'submit' : 'button')}
			variant={local.variant ?? resolveActionVariant(intent())}
			onClick={handleClick}
		/>
	);
}

/**
 * Renders an icon-only button that closes the current dialog.
 */
function DialogClose(props: DialogCloseProps) {
	const context = useDialogContext('Dialog.Close');
	const [local, buttonProps] = splitProps(props, [
		'children',
		'label',
		'onClick',
		'type',
		'variant',
		'size',
		'iconOnly'
	]);
	const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
		callEventHandler(local.onClick, event);

		if (!event.defaultPrevented) {
			context.close();
		}
	};

	return (
		<Button
			{...buttonProps}
			aria-label={buttonProps['aria-label'] ?? local.label ?? 'Закрыть диалог'}
			iconOnly={local.iconOnly ?? true}
			size={local.size ?? 'md'}
			type={local.type ?? 'button'}
			variant={local.variant ?? 'ghost'}
			onClick={handleClick}
		>
			{local.children ?? (
				<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3'>
					<path d='M6 6l12 12M18 6L6 18'/>
				</svg>
			)}
		</Button>
	);
}

export const Dialog = {
	Root: DialogRoot,
	Action: DialogAction,
	Body: DialogBody,
	Close: DialogClose,
	Content: DialogContent,
	Description: DialogDescription,
	Footer: DialogFooter,
	Header: DialogHeader,
	Kicker: DialogKicker,
	Title: DialogTitle
};
