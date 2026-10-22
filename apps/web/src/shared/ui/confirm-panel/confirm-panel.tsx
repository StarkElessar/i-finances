import css from './confirm-panel.module.scss';

import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';

import { createUniqueId, onCleanup, onMount, Show } from 'solid-js';

export type ConfirmPanelProps = {
	/** The question («Удалить ключ «MacBook · Chrome»?»). */
	title: string;
	/** What happens if the person agrees. */
	description?: string;
	confirmLabel: string;
	cancelLabel?: string;
	/** `danger` for something that cannot be undone. */
	tone?: 'danger' | 'primary';
	/** The action is running: both buttons wait. */
	loading?: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	class?: string;
};

/**
 * A confirmation inside the dialog or sheet itself, not a second layer on top of it (mockup `Kit-States`, «подтверждение
 * удаления внутри диалога»; rule S4): a flat card with the question and two small buttons. Focus moves to «Отмена» when
 * it appears, so Enter never confirms by accident, and `Escape` cancels it.
 */
export function ConfirmPanel(props: ConfirmPanelProps) {
	const titleId = createUniqueId();
	let root: HTMLDivElement | undefined;
	let cancelButton: HTMLButtonElement | undefined;

	const handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape' && !props.loading) {
			// The dialog around listens on the document and closes on Escape too; this one only closes the question.
			event.stopPropagation();
			props.onCancel();
		}
	};

	onMount(() => {
		// A native listener on the panel runs before the one of the dialog on the document (Solid delegates `onKeyDown` there).
		root?.addEventListener('keydown', handleKeyDown);
		cancelButton?.focus();
	});
	onCleanup(() => root?.removeEventListener('keydown', handleKeyDown));

	return (
		<div ref={root} aria-labelledby={titleId} class={cn(css.root, props.class)} role='group'>
			<div>
				<b class={css.title} id={titleId}>{props.title}</b>
				<Show when={props.description}>
					<div class={css.description}>{props.description}</div>
				</Show>
			</div>
			<div class={css.actions}>
				<Button disabled={props.loading} ref={cancelButton} size='sm' variant='secondary' onClick={() => props.onCancel()}>
					{props.cancelLabel ?? 'Отмена'}
				</Button>
				<Button
					loading={props.loading}
					size='sm'
					variant={props.tone === 'primary' ? 'primary' : 'danger'}
					onClick={() => props.onConfirm()}
				>
					{props.confirmLabel}
				</Button>
			</div>
		</div>
	);
}
