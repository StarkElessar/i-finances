import css from './toast.module.scss';

import { cn } from '@/shared/lib';

import { For } from 'solid-js';
import { Portal } from 'solid-js/web';

import type { Toaster } from './create-toaster';
import { Toast } from './toast';

export type ToastContainerProps = {
	/** Mount one container per toaster, inside the same theme as the application. */
	toaster: Toaster;
	class?: string;
};

/** Kit-States: newest below, at most three; phone column leaves the FAB and bottom navigation clear. */
export function ToastContainer(props: ToastContainerProps) {
	return (
		<Portal>
			<div aria-label='Уведомления' class={cn(css.container, props.class)} role='region'>
				<For each={props.toaster.toasts()}>{(toast) => <Toast toast={toast} toaster={props.toaster}/>}</For>
			</div>
		</Portal>
	);
}
