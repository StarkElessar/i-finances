import css from './toast.module.scss';

import { cn } from '@/shared/lib';

import { Check, Info, TriangleAlert, X } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { onCleanup, Show } from 'solid-js';

import type { ToastEntry, Toaster } from './create-toaster';

export type ToastProps = {
	toast: ToastEntry;
	toaster: Toaster;
};

/** Non-modal feedback; never moves focus. The message carries the meaning of the decorative icon. */
export function Toast(props: ToastProps) {
	const handleFocusOut: JSX.EventHandler<HTMLDivElement, FocusEvent> = (event) => {
		if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
			return;
		}
		props.toaster.resume(props.toast.id, 'focus');
	};
	const handleAction = (): void => {
		props.toast.action?.onClick();
		props.toaster.dismiss(props.toast.id);
	};
	const handlePointerEnter: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
		if (event.pointerType !== 'touch') {
			props.toaster.pause(props.toast.id, 'hover');
		}
	};
	const handlePointerLeave: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
		if (event.pointerType !== 'touch') {
			props.toaster.resume(props.toast.id, 'hover');
		}
	};

	onCleanup(() => {
		props.toaster.resume(props.toast.id, 'hover');
		props.toaster.resume(props.toast.id, 'focus');
	});

	return (
		<div
			aria-atomic='true'
			class={cn(css.toast, props.toast.tone === 'error' && css.error)}
			role={props.toast.tone === 'error' ? 'alert' : 'status'}
			onFocusIn={() => props.toaster.pause(props.toast.id, 'focus')}
			onFocusOut={handleFocusOut}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
		>
			<span aria-hidden='true' class={css.icon}>
				<Show
					fallback={props.toast.tone === 'success' ? <Check/> : <Info/>}
					when={props.toast.tone === 'error' || props.toast.tone === 'warning'}
				>
					<TriangleAlert/>
				</Show>
			</span>
			<span class={css.message}>{props.toast.message}</span>
			<Show when={props.toast.action}>
				{(action) => <button class={css.action} type='button' onClick={handleAction}>{action().label}</button>}
			</Show>
			<button aria-label='Закрыть уведомление' class={css.close} type='button' onClick={() => props.toaster.dismiss(props.toast.id)}>
				<X aria-hidden='true'/>
			</button>
		</div>
	);
}
