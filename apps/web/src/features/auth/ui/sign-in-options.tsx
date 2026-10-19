import css from './sign-in-card.module.scss';

import { Banner, Button, ButtonLink, Typography } from '@/shared/ui';

import { CircleAlert, Clock, KeyRound, RefreshCw, Send, WifiOff } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { For, Match, Show, Switch } from 'solid-js';

import type { SignInBannerIcon, SignInCardView } from '../model/sign-in-card-view';

import { SignInDivider } from './sign-in-divider';

export type SignInOptionsProps = {
	view: SignInCardView;
	/** The bot link of this browser's own request, while there is one. */
	botUrl?: string;
	passkeyError?: string;
	isPasskeyPending?: boolean;
	onCancel: () => void;
	onOpenTelegram: () => void;
	onPasskey: () => void;
	onRestart: () => void;
	onUsePassword: () => void;
};

const BANNER_ICONS: Record<SignInBannerIcon, () => JSX.Element> = {
	alert: () => <CircleAlert/>,
	clock: () => <Clock/>,
	send: () => <Send/>,
	'wifi-off': () => <WifiOff/>
};

/**
 * The sign-in card with Telegram first and the passkey and the password second (mockup `M-SignIn`, `D-SignIn`, the
 * states of `Auth-Telegram`). Presentational: the states come from `describeSignInCard`.
 */
export function SignInOptions(props: SignInOptionsProps) {
	return (
		<div class={css.root}>
			<div class={css.header}>
				<Typography as='h2' variant='heading-2'>{props.view.title}</Typography>
				<Show when={props.view.description}>
					{(description) => <Typography tone='secondary' variant='body-md'>{description()}</Typography>}
				</Show>
			</div>
			<For each={props.view.banners}>
				{(banner) => (
					<Banner
						icon={BANNER_ICONS[banner.icon]()}
						role={banner.tone === 'danger' ? 'alert' : 'status'}
						title={banner.title}
						tone={banner.tone}
					>
						{banner.text}
					</Banner>
				)}
			</For>
			<Switch>
				<Match when={props.view.telegram.kind === 'link' && props.botUrl ? props.botUrl : undefined}>
					{(botUrl) => (
						<ButtonLink
							fullWidth
							href={botUrl()}
							onClick={() => props.onOpenTelegram()}
							rel='noopener noreferrer'
							size='lg'
							startIcon={<Send/>}
							target='_blank'
						>
							{props.view.telegram.kind === 'link' ? props.view.telegram.label : ''}
						</ButtonLink>
					)}
				</Match>
				<Match when={props.view.telegram.kind === 'loading' || props.view.telegram.kind === 'link'}>
					<Button fullWidth loading size='lg' startIcon={<Send/>}>Войти через Telegram</Button>
				</Match>
				<Match when={props.view.telegram.kind === 'disabled'}>
					<Button disabled fullWidth size='lg' startIcon={<Send/>}>Войти через Telegram</Button>
				</Match>
				<Match when={props.view.telegram.kind === 'restart'}>
					<Button fullWidth onClick={() => props.onRestart()} size='lg' startIcon={<RefreshCw/>}>
						{props.view.telegram.kind === 'restart' ? props.view.telegram.label : ''}
					</Button>
				</Match>
			</Switch>
			<Show when={props.view.isCancellable}>
				<Button fullWidth onClick={() => props.onCancel()} size='lg' variant='ghost'>Отмена</Button>
			</Show>
			<Show when={props.passkeyError}>
				{(error) => <Banner icon={<CircleAlert/>} role='alert' tone='danger'>{error()}</Banner>}
			</Show>
			<Show when={props.view.hasDivider}>
				<SignInDivider/>
			</Show>
			<Show when={props.view.passkey !== 'none'}>
				<Button
					fullWidth
					loading={props.isPasskeyPending}
					onClick={() => props.onPasskey()}
					size='lg'
					startIcon={<KeyRound/>}
					variant='secondary'
				>
					Войти с ключом доступа
				</Button>
			</Show>
			<Show when={props.view.password !== 'none'}>
				<Button
					disabled={props.isPasskeyPending}
					fullWidth
					onClick={() => props.onUsePassword()}
					size='lg'
					variant={props.view.password === 'secondary' ? 'secondary' : 'ghost'}
				>
					Войти по логину и паролю
				</Button>
			</Show>
		</div>
	);
}
