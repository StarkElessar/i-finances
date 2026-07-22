import css from './context-menu.module.scss';

import type { Accessor, JSX } from 'solid-js';
import {
    createContext,
    createEffect,
    createSignal,
    createUniqueId,
    onCleanup,
    onMount,
    Show,
    splitProps,
    useContext
} from 'solid-js';

import { cn } from '~/shared/lib';

const DEFAULT_MOBILE_BREAKPOINT = 640;
const SHEET_CLOSE_OFFSET = 80;
const SHEET_CLOSE_VELOCITY = 0.6;

export type ContextMenuTriggerMode = 'click' | 'contextmenu' | 'both';
export type ContextMenuAnchor = 'trigger' | 'pointer';
export type ContextMenuAlign = 'start' | 'end';
export type ContextMenuItemVariant = 'default' | 'danger';

type AnchorPoint = {
    x: number;
    y: number;
};

type CloseMenuOptions = {
    restoreFocus?: boolean;
};

type ContextMenuContextValue = {
    anchor: Accessor<ContextMenuAnchor>;
    anchorPoint: Accessor<AnchorPoint | undefined>;
    closeMenu: (options?: CloseMenuOptions) => void;
    contentId: string;
    isMobile: Accessor<boolean>;
    isOpen: Accessor<boolean>;
    openMenu: (anchorPoint?: AnchorPoint) => void;
    rootElement: Accessor<HTMLDivElement | undefined>;
    setTriggerElement: (element: HTMLButtonElement) => void;
    toggleMenu: () => void;
    triggerId: string;
    triggerMode: Accessor<ContextMenuTriggerMode>;
};

export type ContextMenuRootProps = {
    anchor?: ContextMenuAnchor;
    children: JSX.Element;
    class?: string;
    defaultOpen?: boolean;
    mobileBreakpoint?: number;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
    triggerMode?: ContextMenuTriggerMode;
};

export type ContextMenuTriggerProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'class'> & {
    children: JSX.Element;
    class?: string;
};

export type ContextMenuContentProps = {
    align?: ContextMenuAlign;
    children: JSX.Element;
    class?: string;
};

export type ContextMenuItemProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'class' | 'onClick'> & {
    children: JSX.Element;
    class?: string;
    closeOnSelect?: boolean;
    onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
    onSelect?: () => Promise<void> | void;
    variant?: ContextMenuItemVariant;
};

export type ContextMenuLabelProps = {
    children: JSX.Element;
    class?: string;
};

export type ContextMenuSeparatorProps = {
    class?: string;
};

const ContextMenuContext = createContext<ContextMenuContextValue>();

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
 * Returns true when a trigger should open on left click.
 */
function isClickTriggerMode(mode: ContextMenuTriggerMode): boolean {
    return mode === 'click' || mode === 'both';
}

/**
 * Returns true when a trigger should open on contextmenu.
 */
function isContextMenuTriggerMode(mode: ContextMenuTriggerMode): boolean {
    return mode === 'contextmenu' || mode === 'both';
}

/**
 * Reads the nearest context menu provider or throws a clear composition error.
 */
function useContextMenuContext(componentName: string): ContextMenuContextValue {
    const context = useContext(ContextMenuContext);

    if (!context) {
        throw new Error(`${componentName} must be used inside ContextMenu.Root.`);
    }

    return context;
}

/**
 * Returns focusable menu item buttons inside one content node.
 */
function getEnabledMenuItems(content: HTMLElement): HTMLButtonElement[] {
    return Array.from(content.querySelectorAll<HTMLButtonElement>('[data-context-menu-item]:not(:disabled)'));
}

/**
 * Moves focus through enabled menu items.
 */
function focusMenuItem(content: HTMLElement, direction: 1 | -1): void {
    const items = getEnabledMenuItems(content);

    if (!items.length) {
        return;
    }

    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex = currentIndex === -1
        ? (direction === 1 ? 0 : items.length - 1)
        : (currentIndex + direction + items.length) % items.length;

    items[nextIndex]?.focus();
}

/**
 * Moves focus to the first or last enabled item.
 */
function focusMenuEdgeItem(content: HTMLElement, edge: 'first' | 'last'): void {
    const items = getEnabledMenuItems(content);
    const item = edge === 'first' ? items[0] : items.at(-1);

    item?.focus();
}

/**
 * Provides open state and trigger wiring for a reusable context menu.
 */
function ContextMenuRoot(props: ContextMenuRootProps) {
    let rootElement: HTMLDivElement | undefined;
    let triggerElement: HTMLButtonElement | undefined;
    const triggerId = createUniqueId();
    const contentId = createUniqueId();
    const [internalOpen, setInternalOpen] = createSignal(Boolean(props.defaultOpen));
    const [anchorPoint, setAnchorPoint] = createSignal<AnchorPoint>();
    const [isMobile, setIsMobile] = createSignal(false);
    const isOpen = () => props.open ?? internalOpen();
    const triggerMode = () => props.triggerMode ?? 'click';
    const anchor = () => props.anchor ?? 'trigger';

    const setOpen = (open: boolean): void => {
        if (props.open === undefined) {
            setInternalOpen(open);
        }

        if (!open) {
            setAnchorPoint(undefined);
        }

        props.onOpenChange?.(open);
    };
    const focusTrigger = (): void => {
        setTimeout(() => triggerElement?.focus(), 0);
    };
    const closeMenu = (options: CloseMenuOptions = {}): void => {
        setOpen(false);

        if (options.restoreFocus ?? true) {
            focusTrigger();
        }
    };
    const openMenu = (nextAnchorPoint?: AnchorPoint): void => {
        setAnchorPoint(nextAnchorPoint);
        setOpen(true);
    };
    const toggleMenu = (): void => {
        if (isOpen()) {
            closeMenu();
            return;
        }

        openMenu();
    };
    const setTriggerElement = (element: HTMLButtonElement): void => {
        triggerElement = element;
    };

    onMount(() => {
        const breakpoint = props.mobileBreakpoint ?? DEFAULT_MOBILE_BREAKPOINT;
        const mediaQuery = window.matchMedia(`(max-width: ${breakpoint / 16}em)`);
        const syncMobileState = () => setIsMobile(mediaQuery.matches);

        syncMobileState();
        mediaQuery.addEventListener('change', syncMobileState);
        onCleanup(() => mediaQuery.removeEventListener('change', syncMobileState));
    });

    createEffect(() => {
        if (isOpen()) {
            const handlePointerDown = (event: PointerEvent): void => {
                const root = rootElement;

                if (root && event.target instanceof Node && !root.contains(event.target)) {
                    closeMenu({ restoreFocus: false });
                }
            };
            const handleKeyDown = (event: KeyboardEvent): void => {
                if (event.key === 'Escape') {
                    closeMenu();
                }
            };

            document.addEventListener('pointerdown', handlePointerDown, true);
            document.addEventListener('keydown', handleKeyDown);
            onCleanup(() => {
                document.removeEventListener('pointerdown', handlePointerDown, true);
                document.removeEventListener('keydown', handleKeyDown);
            });
        }
    });

    const context: ContextMenuContextValue = {
        anchor,
        anchorPoint,
        closeMenu,
        contentId,
        isMobile,
        isOpen,
        openMenu,
        rootElement: () => rootElement,
        setTriggerElement,
        toggleMenu,
        triggerId,
        triggerMode
    };

    return (
        <ContextMenuContext.Provider value={context}>
            <div ref={rootElement} class={cn(css.root, props.class)}>
                {props.children}
            </div>
        </ContextMenuContext.Provider>
    );
}

/**
 * Renders the button that opens a context menu.
 */
function ContextMenuTrigger(props: ContextMenuTriggerProps) {
    const context = useContextMenuContext('ContextMenu.Trigger');
    const [local, buttonProps] = splitProps(props, [
        'children',
        'class',
        'onClick',
        'onContextMenu',
        'type'
    ]);
    const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
        callEventHandler(local.onClick, event);

        if (event.defaultPrevented || !isClickTriggerMode(context.triggerMode())) {
            return;
        }

        context.toggleMenu();
    };
    const handleContextMenu: JSX.EventHandler<HTMLButtonElement, PointerEvent> = (event) => {
        callEventHandler(local.onContextMenu, event);

        if (event.defaultPrevented || !isContextMenuTriggerMode(context.triggerMode())) {
            return;
        }

        event.preventDefault();
        context.openMenu(context.anchor() === 'pointer'
            ? { x: event.clientX, y: event.clientY }
            : undefined);
    };

    return (
        <button
            {...buttonProps}
            ref={context.setTriggerElement}
            aria-controls={context.isOpen() ? context.contentId : undefined}
            aria-expanded={context.isOpen()}
            aria-haspopup='menu'
            class={cn(css.trigger, local.class)}
            id={context.triggerId}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            type={local.type ?? 'button'}
        >
            {local.children}
        </button>
    );
}

/**
 * Renders popover content on desktop and a draggable bottom sheet on mobile.
 */
function ContextMenuContent(props: ContextMenuContentProps) {
    let contentElement: HTMLDivElement | undefined;
    let dragStartY = 0;
    let dragStartTime = 0;
    const context = useContextMenuContext('ContextMenu.Content');
    const [dragOffset, setDragOffset] = createSignal(0);
    const [isDragging, setIsDragging] = createSignal(false);
    const align = () => props.align ?? 'start';
    const contentStyle = (): string => {
        const point = context.anchorPoint();
        const dragStyle = `--context-menu-drag-offset: ${dragOffset()}px;`;

        if (point && !context.isMobile()) {
            return `${dragStyle} inset-block-start: ${point.y}px; inset-inline-start: ${point.x}px;`;
        }

        return dragStyle;
    };
    const resetDrag = (): void => {
        setIsDragging(false);
        setDragOffset(0);
    };
    const handlePointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
        if (!context.isMobile() || event.button !== 0) {
            return;
        }

        dragStartY = event.clientY;
        dragStartTime = performance.now();
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const handlePointerMove: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
        if (!isDragging()) {
            return;
        }

        const nextOffset = Math.max(0, event.clientY - dragStartY);

        if (nextOffset > 4) {
            event.preventDefault();
        }

        setDragOffset(nextOffset);
    };
    const handlePointerUp: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
        if (!isDragging()) {
            return;
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        const elapsed = Math.max(1, performance.now() - dragStartTime);
        const velocity = dragOffset() / elapsed;

        if (dragOffset() >= SHEET_CLOSE_OFFSET || velocity >= SHEET_CLOSE_VELOCITY) {
            resetDrag();
            context.closeMenu();
            return;
        }

        resetDrag();
    };
    const handlePointerCancel: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        resetDrag();
    };
    const handleKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
        if (!contentElement) {
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusMenuItem(contentElement, 1);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusMenuItem(contentElement, -1);
            return;
        }

        if (event.key === 'Home') {
            event.preventDefault();
            focusMenuEdgeItem(contentElement, 'first');
            return;
        }

        if (event.key === 'End') {
            event.preventDefault();
            focusMenuEdgeItem(contentElement, 'last');
        }
    };

    createEffect(() => {
        if (context.isOpen()) {
            setTimeout(() => contentElement && focusMenuEdgeItem(contentElement, 'first'), 0);
        }
    });

    return (
        <Show when={context.isOpen()}>
            <Show when={context.isMobile()}>
                <button
                    aria-label='Закрыть меню'
                    class={css.backdrop}
                    onClick={() => context.closeMenu()}
                    type='button'
                />
            </Show>
            <div
                ref={contentElement}
                aria-labelledby={context.triggerId}
                class={cn(
                    css.content,
                    context.isMobile() ? css.sheet : css.popover,
                    context.anchorPoint() && !context.isMobile() && css.pointerPopover,
                    !context.anchorPoint() && align() === 'end' && css.alignEnd,
                    !context.anchorPoint() && align() === 'start' && css.alignStart,
                    isDragging() && css.dragging,
                    props.class
                )}
                id={context.contentId}
                onKeyDown={handleKeyDown}
                role='menu'
                style={contentStyle()}
            >
                <Show when={context.isMobile()}>
                    <div
                        aria-hidden='true'
                        class={css.sheetDragZone}
                        onPointerCancel={handlePointerCancel}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                    >
                        <div class={css.sheetHandle}/>
                    </div>
                </Show>
                {props.children}
            </div>
        </Show>
    );
}

/**
 * Renders one selectable menu row.
 */
function ContextMenuItem(props: ContextMenuItemProps) {
    const context = useContextMenuContext('ContextMenu.Item');
    const [local, buttonProps] = splitProps(props, [
        'children',
        'class',
        'closeOnSelect',
        'onClick',
        'onSelect',
        'type',
        'variant'
    ]);
    const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
        callEventHandler(local.onClick, event);

        if (event.defaultPrevented || buttonProps.disabled) {
            return;
        }

        void local.onSelect?.();

        if (local.closeOnSelect !== false) {
            context.closeMenu();
        }
    };

    return (
        <button
            {...buttonProps}
            class={cn(
                css.item,
                (local.variant ?? 'default') === 'danger' && css.itemDanger,
                local.class
            )}
            data-context-menu-item=''
            onClick={handleClick}
            role='menuitem'
            type={local.type ?? 'button'}
        >
            {local.children}
        </button>
    );
}

/**
 * Renders non-interactive menu metadata.
 */
function ContextMenuLabel(props: ContextMenuLabelProps) {
    return (
        <div class={cn(css.label, props.class)}>
            {props.children}
        </div>
    );
}

/**
 * Renders a visual separator between menu groups.
 */
function ContextMenuSeparator(props: ContextMenuSeparatorProps) {
    return <div aria-hidden='true' class={cn(css.separator, props.class)}/>;
}

export const ContextMenu = {
    Root: ContextMenuRoot,
    Trigger: ContextMenuTrigger,
    Content: ContextMenuContent,
    Item: ContextMenuItem,
    Label: ContextMenuLabel,
    Separator: ContextMenuSeparator
};
