import css from './app-invitation-dialog.module.scss';

import { copyText, formatDeadline } from '@/shared/lib';
import { Banner, Button, TextField } from '@/shared/ui';

import type { CreatedAppInvitation as CreatedInvitation } from '@i-finances/contracts';
import { CircleAlert, CircleCheck, Copy, Link, Share2 } from 'lucide-solid';
import { createSignal, Show } from 'solid-js';

export type CreatedAppInvitationProps = {
	invitation: CreatedInvitation;
	canShare?: boolean;
};

export function CreatedAppInvitation(props: CreatedAppInvitationProps) {
	const [copyState, setCopyState] = createSignal<'idle' | 'copied' | 'failed'>('idle');
	const [shareError, setShareError] = createSignal(false);
	const canShare = () => props.canShare ?? (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

	const handleCopy = async () => {
		setCopyState(await copyText(props.invitation.link) ? 'copied' : 'failed');
	};
	const handleShare = async () => {
		setShareError(false);

		try {
			await navigator.share({ title: 'Приглашение в i-finances', url: props.invitation.link });
		}
		catch (error: unknown) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) {
				setShareError(true);
			}
		}
	};

	return (
		<div class={css.section}>
			<Banner icon={<CircleCheck/>} role='status' title='Приглашение создано.' tone='success'>
				Действует до {formatDeadline(props.invitation.expiresAt) ?? '…'}.
			</Banner>
			<TextField
				aria-label='Ссылка-приглашение'
				autocomplete='off'
				onFocus={(event) => event.currentTarget.select()}
				readOnly
				spellcheck={false}
				startContent={<Link/>}
				value={props.invitation.link}
			/>
			<div class={css.actions}>
				<Button onClick={() => void handleCopy()} startIcon={<Copy/>}>
					{copyState() === 'copied' ? 'Скопировано' : 'Скопировать'}
				</Button>
				<Show when={canShare()}>
					<Button onClick={() => void handleShare()} startIcon={<Share2/>} variant='secondary'>Поделиться</Button>
				</Show>
			</div>
			<Show when={copyState() === 'failed'}>
				<Banner role='alert' tone='danger'>Не удалось скопировать. Выделите ссылку в поле и скопируйте её вручную.</Banner>
			</Show>
			<Show when={shareError()}>
				<Banner role='alert' tone='danger'>Не удалось поделиться. Скопируйте ссылку и отправьте её вручную.</Banner>
			</Show>
			<Banner icon={<CircleAlert/>} tone='warning'>
				Ссылка одноразовая и действует 7 дней. Пересылайте её только тому, кого приглашаете. Показывается один раз.
			</Banner>
		</div>
	);
}
