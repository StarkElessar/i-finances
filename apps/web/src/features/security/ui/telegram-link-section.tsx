import css from './telegram-link-section.module.scss';

import { Banner, Button, ButtonLink, List, ListRow } from '@/shared/ui';
import { Typography } from '@/shared/ui';

import type { ViewerTelegram } from '@/entities/viewer';

import { CircleAlert, Clock, RefreshCw, Send, WifiOff } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { createEffect, createMemo, For, Match, on, Show, Switch } from 'solid-js';

import { createTelegramLink } from '../model/create-telegram-link';
import { describeTelegramLink, LINK_BUTTON_LABEL, LINK_FORWARD_HINT, type TelegramLinkBannerIcon } from '../model/describe-telegram-link';
import type { TelegramLinkGateway } from '../model/telegram-link-protocol';

import { SecuritySection } from './security-section';
import { TelegramLinkConfirmation } from './telegram-link-confirmation';

export type TelegramLinkSectionProps = {
	gateway: TelegramLinkGateway;
	/** Telegram was linked: the viewer snapshot is patched in place (no session refetch, memory `viewer-refetch-remount-bug`). */
	onLinked: (telegram: ViewerTelegram) => void;
};

const BANNER_ICONS: Record<TelegramLinkBannerIcon, () => JSX.Element> = {
	alert: () => <CircleAlert/>,
	clock: () => <Clock/>,
	send: () => <Send/>,
	'wifi-off': () => <WifiOff/>
};

/**
 * Linking Telegram to an account that has none (flow 5.3, decision Р9; mockup `D-Security`: waiting and two errors). The
 * request starts when the block appears; the link is an `https://t.me/...` anchor the browser follows by itself, and the
 * browser polls until the bot answers. Everything stops when the dialog is closed. After the success the linked name is
 * shown large. The block is not shown at all when Telegram is switched off on the server.
 */
export function TelegramLinkSection(props: TelegramLinkSectionProps) {
	const link = createTelegramLink(props.gateway);
	const view = createMemo(() => describeTelegramLink(link.state()));
	const confirmed = () => {
		const state = link.state();

		return state.kind === 'confirmed' ? state : undefined;
	};
	const isUnavailable = () => link.state().kind === 'unavailable';

	createEffect(on(confirmed, (state) => {
		if (state !== undefined) {
			props.onLinked(state.telegram);
		}
	}));

	return (
		<Show when={!isUnavailable()}>
			<SecuritySection title='Telegram'>
				<Show
					fallback={(
						<Show when={view()}>
							{(current) => (
								<>
									<List aria-label='Telegram'>
										<ListRow icon={<Send/>} meta='Не привязан' title='Telegram'/>
									</List>
									<For each={current().banners}>
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
									<div class={css.actions}>
										<Switch>
											<Match when={current().action.kind === 'link' ? current().action : undefined} keyed>
												{(action) => action.kind === 'link' && (
													<ButtonLink
														class={css.primary}
														href={action.botUrl}
														rel='noopener noreferrer'
														startIcon={<Send/>}
														target='_blank'
														variant={action.variant}
														onClick={() => link.openTelegram()}
													>
														{action.label}
													</ButtonLink>
												)}
											</Match>
											<Match when={current().action.kind === 'loading'}>
												<Button class={css.primary} loading startIcon={<Send/>}>{LINK_BUTTON_LABEL}</Button>
											</Match>
											<Match when={current().action.kind === 'restart' ? current().action : undefined} keyed>
												{(action) => action.kind === 'restart' && (
													<Button class={css.primary} startIcon={<RefreshCw/>} onClick={() => link.start()}>
														{action.label}
													</Button>
												)}
											</Match>
										</Switch>
										<Show when={current().isCancellable}>
											<Button variant='ghost' onClick={() => link.cancel()}>Отмена</Button>
										</Show>
									</div>
									<Show when={current().showForwardHint}>
										<Typography tone='tertiary' variant='caption'>{LINK_FORWARD_HINT}</Typography>
									</Show>
								</>
							)}
						</Show>
					)}
					when={confirmed()}
				>
					{(state) => <TelegramLinkConfirmation username={state().telegram.username}/>}
				</Show>
			</SecuritySection>
		</Show>
	);
}
