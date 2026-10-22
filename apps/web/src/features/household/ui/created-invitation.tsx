import css from './created-invitation.module.scss';

import { copyText, formatDeadline } from '@/shared/lib';
import { Banner, Button, TextField } from '@/shared/ui';

import type { CreatedHouseholdInvitation } from '@i-finances/contracts';
import { CircleAlert, CircleCheck, Copy, Link, Share2 } from 'lucide-solid';
import { createSignal, onCleanup, Show } from 'solid-js';

import { formatDayCount } from '../model/format-day-count';

export type CreatedInvitationProps = {
	invitation: CreatedHouseholdInvitation;
	/** Current time in ms, for «(7 дней)»; a prop so a story shows a fixed deadline. */
	now: number;
	/** «Готово»: the link leaves the page and cannot be shown again. */
	onDone: () => void;
	/** Whether the browser can share (`navigator.share`); the button is hidden otherwise. */
	canShare?: boolean;
};

const COPIED_VISIBLE_MS = 2000;

const MS_PER_DAY = 86_400_000;

/**
 * The invitation that was just created (board `D-Household`, «Приглашение создано»): the link in a read-only field, copy
 * and share buttons and the warning that the link opens all the family's finances. The link is shown once: it is not
 * stored anywhere, and after «Готово» (or closing the dialog) there is no way to read it again, only to revoke the
 * invitation and create a new one.
 */
export function CreatedInvitation(props: CreatedInvitationProps) {
	const [copyState, setCopyState] = createSignal<'copied' | 'failed' | 'idle'>('idle');
	const canShare = () => props.canShare ?? (typeof navigator.share === 'function');
	const deadline = () => formatDeadline(props.invitation.expiresAt);
	const days = () => Math.round((new Date(props.invitation.expiresAt).getTime() - props.now) / MS_PER_DAY);
	let resetTimer: number | undefined;

	const handleCopy = async (): Promise<void> => {
		setCopyState(await copyText(props.invitation.link) ? 'copied' : 'failed');
		window.clearTimeout(resetTimer);
		resetTimer = window.setTimeout(() => setCopyState('idle'), COPIED_VISIBLE_MS);
	};

	const handleShare = async (): Promise<void> => {
		try {
			await navigator.share({ title: 'Приглашение в iFinances', url: props.invitation.link });
		}
		catch {
			// The person closed the share sheet, or the browser refused: the link is still in the field.
		}
	};

	onCleanup(() => window.clearTimeout(resetTimer));

	return (
		<div class={css.root}>
			<Banner icon={<CircleCheck/>} role='status' title='Приглашение создано.' tone='success'>
				<Show fallback='Ссылка готова.' when={deadline()}>
					{(text) => <>Действует до {text()}{days() >= 1 ? ` (${formatDayCount(days())})` : ''}.</>}
				</Show>
			</Banner>
			<TextField
				aria-label='Ссылка-приглашение'
				onFocus={(event) => event.currentTarget.select()}
				readOnly
				startContent={<Link/>}
				value={props.invitation.link}
			/>
			<div class={css.actions}>
				<Button onClick={() => void handleCopy()} size='sm' startIcon={<Copy/>}>
					{copyState() === 'copied' ? 'Скопировано' : 'Скопировать'}
				</Button>
				<Show when={canShare()}>
					<Button onClick={() => void handleShare()} size='sm' startIcon={<Share2/>} variant='secondary'>Поделиться</Button>
				</Show>
				<Button onClick={() => props.onDone()} size='sm' variant='ghost'>Готово</Button>
			</div>
			<Show when={copyState() === 'failed'}>
				<Banner icon={<CircleAlert/>} role='alert' tone='danger'>
					Не удалось скопировать. Выделите ссылку в поле и скопируйте её вручную.
				</Banner>
			</Show>
			<Banner icon={<CircleAlert/>} tone='warning'>
				Ссылка даёт доступ ко всем финансам окружения. Отправьте её только тому, кого приглашаете. Показывается один раз.
			</Banner>
		</div>
	);
}
