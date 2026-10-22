import css from './inline-confirm.module.scss';

import { cn } from '@/shared/lib';
import { Banner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { FlatCard } from '@/shared/ui/flat-card';
import { Typography } from '@/shared/ui/typography';

import { createUniqueId, Show } from 'solid-js';

export type InlineConfirmProps = {
	/** The question: «Удалить Анну из окружения?». */
	title: string;
	/** What follows from yes. */
	description: string;
	/** The verb of the destructive button: «Удалить участника». */
	confirmLabel: string;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
	/** The request is running: the confirm button spins, both are disabled. */
	loading?: boolean;
	/** Why the last confirm did not work. */
	error?: string;
	class?: string;
};

/**
 * Confirmation of a dangerous action inside the open dialog or sheet, instead of a second window on top (kit rule,
 * board `Kit-States`, «Подтверждение удаления внутри диалога»; boards `D-Household`). Focus goes to the question when it
 * appears, so a screen reader reads it, and returns with the dialog's own focus handling when it is closed.
 */
export function InlineConfirm(props: InlineConfirmProps) {
	const titleId = createUniqueId();

	return (
		<div aria-labelledby={titleId} class={cn(css.root, props.class)} role='group'>
			<FlatCard>
				<div class={css.content}>
					<div class={css.question}>
						<Typography focusOnMount id={titleId} variant='body-md' weight='semibold'>{props.title}</Typography>
						<Typography tone='secondary' variant='caption'>{props.description}</Typography>
					</div>
					<Show when={props.error}>
						{(message) => <Banner role='alert' tone='danger'>{message()}</Banner>}
					</Show>
					<div class={css.actions}>
						<Button disabled={props.loading} onClick={() => props.onCancel()} size='sm' variant='secondary'>
							{props.cancelLabel ?? 'Отмена'}
						</Button>
						<Button loading={props.loading} onClick={() => props.onConfirm()} size='sm' variant='danger'>
							{props.confirmLabel}
						</Button>
					</div>
				</div>
			</FlatCard>
		</div>
	);
}
