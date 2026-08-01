import css from './drag-action.module.scss';

import type { Accessor, JSX } from 'solid-js';
import { createSignal, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

import { cn } from '~/shared/lib';

export type DragActionTone = 'danger' | 'neutral';

type DragPointerEvent = PointerEvent & { currentTarget: HTMLElement };

type DragSession = {
	clientX: number;
	clientY: number;
	hasMoved: boolean;
	id: string;
	pointerId: number;
	startX: number;
	startY: number;
};

export type CreateDragActionOptions = {
	onDrop: (id: string) => void;
	threshold?: number;
};

export type DragActionController = {
	activeId: Accessor<string | undefined>;
	isOverZone: Accessor<boolean>;
	consumeClick: (id: string) => boolean;
	onPointerCancel: (event: DragPointerEvent) => void;
	onPointerDown: (id: string, event: DragPointerEvent) => void;
	onPointerMove: (event: DragPointerEvent) => void;
	onPointerUp: (event: DragPointerEvent) => void;
	setPreviewElement: (element: HTMLElement) => void;
	setZoneElement: (element: HTMLElement) => void;
};

export type DragActionOverlayProps = {
	children: JSX.Element | ((activeId: string) => JSX.Element);
	controller: DragActionController;
	icon: JSX.Element;
	label: string;
	class?: string;
	mount?: Node;
	previewClass?: string;
	tone?: DragActionTone;
	zoneClass?: string;
};

export type DragActionPreviewProps = {
	description: string;
	icon: JSX.Element;
	title: string;
	accentColor?: string;
	class?: string;
};

const DEFAULT_THRESHOLD_PX = 8;
const ZONE_CLASS_BY_TONE: Record<DragActionTone, string> = {
	danger: css.zoneDanger,
	neutral: css.zoneNeutral
};

function getPreviewTransform(clientX: number, clientY: number): string {
	return `translate3d(${clientX}px, ${clientY}px, 0) translate(-50%, -50%) rotate(-1deg)`;
}

function isPointInsideElement(x: number, y: number, element: HTMLElement | undefined): boolean {
	if (element === undefined) {
		return false;
	}

	const rect = element.getBoundingClientRect();

	return x >= rect.left
		&& x <= rect.right
		&& y >= rect.top
		&& y <= rect.bottom;
}

function releasePointerCapture(element: HTMLElement, pointerId: number): void {
	if (element.hasPointerCapture(pointerId)) {
		element.releasePointerCapture(pointerId);
	}
}

function resolveOverlayChildren(
	children: DragActionOverlayProps['children'],
	activeId: string
): JSX.Element {
	return typeof children === 'function' ? children(activeId) : children;
}

function getPreviewStyle(accentColor: string | undefined): JSX.CSSProperties | undefined {
	if (accentColor === undefined) {
		return undefined;
	}

	return { '--drag-action-accent': accentColor };
}

export function createDragAction(options: CreateDragActionOptions): DragActionController {
	let animationFrameId: number | undefined;
	let previewElement: HTMLElement | undefined;
	let session: DragSession | undefined;
	let suppressedClickId: string | undefined;
	let suppressionTimerId: number | undefined;
	let zoneElement: HTMLElement | undefined;
	const [activeId, setActiveId] = createSignal<string>();
	const [isOverZone, setIsOverZone] = createSignal(false);

	const clearAnimationFrame = () => {
		if (animationFrameId === undefined) {
			return;
		}

		window.cancelAnimationFrame(animationFrameId);
		animationFrameId = undefined;
	};

	const clearSuppressionTimer = () => {
		if (suppressionTimerId === undefined) {
			return;
		}

		window.clearTimeout(suppressionTimerId);
		suppressionTimerId = undefined;
	};

	const updateVisuals = () => {
		animationFrameId = undefined;

		if (session === undefined || !session.hasMoved) {
			return;
		}

		const isOver = isPointInsideElement(session.clientX, session.clientY, zoneElement);

		if (previewElement !== undefined) {
			previewElement.style.transform = getPreviewTransform(session.clientX, session.clientY);
		}

		setIsOverZone(isOver);
	};

	const scheduleVisualUpdate = () => {
		if (animationFrameId === undefined) {
			animationFrameId = window.requestAnimationFrame(updateVisuals);
		}
	};

	const resetSession = () => {
		clearAnimationFrame();
		session = undefined;
		previewElement = undefined;
		zoneElement = undefined;
		setActiveId(undefined);
		setIsOverZone(false);
	};

	const suppressNextClick = (id: string) => {
		clearSuppressionTimer();
		suppressedClickId = id;
		suppressionTimerId = window.setTimeout(() => {
			suppressedClickId = undefined;
			suppressionTimerId = undefined;
		}, 0);
	};

	const consumeClick = (id: string): boolean => {
		if (suppressedClickId !== id) {
			return false;
		}

		clearSuppressionTimer();
		suppressedClickId = undefined;

		return true;
	};

	const onPointerDown = (id: string, event: DragPointerEvent) => {
		if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
			return;
		}

		event.currentTarget.setPointerCapture(event.pointerId);
		suppressedClickId = undefined;
		session = {
			clientX: event.clientX,
			clientY: event.clientY,
			hasMoved: false,
			id,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY
		};
	};

	const onPointerMove = (event: DragPointerEvent) => {
		const currentSession = session;

		if (currentSession === undefined || currentSession.pointerId !== event.pointerId) {
			return;
		}

		currentSession.clientX = event.clientX;
		currentSession.clientY = event.clientY;

		if (!currentSession.hasMoved) {
			const distance = Math.hypot(
				event.clientX - currentSession.startX,
				event.clientY - currentSession.startY
			);

			if (distance < (options.threshold ?? DEFAULT_THRESHOLD_PX)) {
				return;
			}

			currentSession.hasMoved = true;
			setActiveId(currentSession.id);
		}

		event.preventDefault();
		scheduleVisualUpdate();
	};

	const onPointerUp = (event: DragPointerEvent) => {
		const currentSession = session;

		if (currentSession === undefined || currentSession.pointerId !== event.pointerId) {
			return;
		}

		releasePointerCapture(event.currentTarget, event.pointerId);

		if (currentSession.hasMoved) {
			event.preventDefault();
			suppressNextClick(currentSession.id);
		}

		const shouldDrop = currentSession.hasMoved
			&& isPointInsideElement(event.clientX, event.clientY, zoneElement);
		const droppedId = currentSession.id;

		resetSession();

		if (shouldDrop) {
			options.onDrop(droppedId);
		}
	};

	const onPointerCancel = (event: DragPointerEvent) => {
		if (session === undefined || session.pointerId !== event.pointerId) {
			return;
		}

		releasePointerCapture(event.currentTarget, event.pointerId);
		resetSession();
	};

	const setPreviewElement = (element: HTMLElement) => {
		previewElement = element;

		if (session !== undefined) {
			element.style.transform = getPreviewTransform(session.clientX, session.clientY);
		}
	};

	const setZoneElement = (element: HTMLElement) => {
		zoneElement = element;
	};

	onCleanup(() => {
		clearAnimationFrame();
		clearSuppressionTimer();
	});

	return {
		activeId,
		consumeClick,
		isOverZone,
		onPointerCancel,
		onPointerDown,
		onPointerMove,
		onPointerUp,
		setPreviewElement,
		setZoneElement
	};
}

function DragActionOverlay(props: DragActionOverlayProps) {
	const tone = () => props.tone ?? 'neutral';

	return (
		<Show when={props.controller.activeId()}>
			{(activeId) => (
				<Portal mount={props.mount}>
					<div
						ref={props.controller.setZoneElement}
						aria-hidden='true'
						class={cn(
							css.zone,
							ZONE_CLASS_BY_TONE[tone()],
							props.controller.isOverZone() && css.zoneActive,
							props.zoneClass
						)}
					>
						<span class={css.zoneIcon}>{props.icon}</span>
						<span class={css.zoneLabel}>{props.label}</span>
					</div>
					<div
						ref={props.controller.setPreviewElement}
						aria-hidden='true'
						class={cn(
							css.previewMotion,
							props.controller.isOverZone() && css.previewMotionActive,
							props.class
						)}
					>
						<div class={cn(css.previewSurface, props.previewClass)}>
							{resolveOverlayChildren(props.children, activeId())}
						</div>
					</div>
				</Portal>
			)}
		</Show>
	);
}

function DragActionPreview(props: DragActionPreviewProps) {
	return (
		<div
			class={cn(css.preview, props.class)}
			style={getPreviewStyle(props.accentColor)}
		>
			<span class={css.previewIcon}>{props.icon}</span>
			<span class={css.previewContent}>
				<span class={css.previewTitle}>{props.title}</span>
				<span>{props.description}</span>
			</span>
		</div>
	);
}

export const DragAction = {
	Overlay: DragActionOverlay,
	Preview: DragActionPreview
};
