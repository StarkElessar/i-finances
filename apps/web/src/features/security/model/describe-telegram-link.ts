import { formatMinutesAccusative, formatMinutesGenitive } from '@/shared/lib';
import type { BannerTone } from '@/shared/ui';

import type { TelegramLinkState } from './telegram-link-state';

export type TelegramLinkBannerIcon = 'alert' | 'clock' | 'send' | 'wifi-off';

export type TelegramLinkBannerView = {
	icon: TelegramLinkBannerIcon;
	text: string;
	title?: string;
	tone: BannerTone;
};

export type TelegramLinkAction =
	/** The person explicitly begins linking before a request is created. */
	| { kind: 'start' }
	/** The bot link (`ButtonLink`): pressing it starts the waiting. */
	| { botUrl: string; kind: 'link'; label: string; variant: 'primary' | 'secondary' }
	/** The link is being prepared: a disabled button with a spinner. */
	| { kind: 'loading' }
	/** A button that starts a new request. */
	| { kind: 'restart'; label: string }
	| { kind: 'none' };

/** What the Telegram block shows for a state of the link flow (the Telegram states of `D-Security`). */
export type TelegramLinkView = {
	action: TelegramLinkAction;
	banners: TelegramLinkBannerView[];
	/** «Отмена» next to the link while waiting. */
	isCancellable: boolean;
	/** «Не пересылайте эту ссылку…» under the link: whoever presses «Привязать» first links their own Telegram. */
	showForwardHint: boolean;
};

export const LINK_FORWARD_HINT = 'Не пересылайте эту ссылку и не отправляйте её никому: '
	+ 'кто первым нажмёт «Привязать» в Telegram, привяжет к вашему аккаунту свой Telegram.';

export const LINK_BUTTON_LABEL = 'Привязать Telegram';

const TRY_AGAIN = 'Попробовать снова';

const SECONDS_PER_MINUTE = 60;

const DEFAULT_TTL_MINUTES = 10;

function failed(banner: TelegramLinkBannerView, action: TelegramLinkAction = { kind: 'none' }): TelegramLinkView {
	return { action, banners: [banner], isCancellable: false, showForwardHint: false };
}

/**
 * The view of the Telegram block for one state of the flow; `confirmed` is shown by its own panel.
 */
export function describeTelegramLink(state: TelegramLinkState): TelegramLinkView | null {
	switch (state.kind) {
		case 'idle':
			return { action: { kind: 'start' }, banners: [], isCancellable: false, showForwardHint: false };

		case 'preparing':
			return { action: { kind: 'loading' }, banners: [], isCancellable: false, showForwardHint: false };

		case 'ready':
			return {
				action: { botUrl: state.link.botUrl, kind: 'link', label: 'Открыть Telegram', variant: 'primary' },
				banners: [],
				isCancellable: false,
				showForwardHint: true
			};

		case 'waiting': {
			const banners: TelegramLinkBannerView[] = [{
				icon: 'send',
				text: `Откройте бота и нажмите «Привязать». Заявка действует ${formatMinutesAccusative(state.link.ttlMinutes)}.`,
				title: 'Ждём подтверждения в Telegram.',
				tone: 'info'
			}];

			if (state.connectionLost) {
				banners.push({
					icon: 'wifi-off',
					text: 'Проверим снова, как только соединение вернётся.',
					title: 'Нет связи с сервером.',
					tone: 'warning'
				});
			}

			return {
				action: { botUrl: state.link.botUrl, kind: 'link', label: 'Открыть Telegram ещё раз', variant: 'secondary' },
				banners,
				isCancellable: true,
				showForwardHint: true
			};
		}

		case 'confirmed':
			return null;

		case 'unavailable':
			return failed({ icon: 'alert', text: 'Привязка Telegram сейчас недоступна.', tone: 'neutral' });

		case 'failed':
			switch (state.reason) {
				case 'expired':
					return failed({
						icon: 'clock',
						text: `Прошло больше ${formatMinutesGenitive(state.ttlMinutes ?? DEFAULT_TTL_MINUTES)}. Начните привязку заново.`,
						title: 'Ссылка устарела.',
						tone: 'warning'
					}, { kind: 'restart', label: TRY_AGAIN });

				case 'browser-mismatch':
					return failed({ icon: 'alert', text: state.message, tone: 'danger' }, { kind: 'restart', label: 'Начать заново' });

				case 'rejected':
					return failed({ icon: 'alert', text: state.message, tone: 'warning' }, { kind: 'restart', label: TRY_AGAIN });

				case 'linked-elsewhere':
					return failed({ icon: 'alert', text: state.message, tone: 'danger' }, { kind: 'restart', label: TRY_AGAIN });

				case 'account-has-telegram':
					// The session did not show the linked Telegram either (the flow asked it first): nothing to retry.
					return failed({ icon: 'alert', text: state.message, tone: 'danger' });

				case 'rate-limited': {
					const minutes = Math.max(1, Math.ceil((state.retryAfterSeconds ?? SECONDS_PER_MINUTE) / SECONDS_PER_MINUTE));

					return failed({
						icon: 'alert',
						text: `Повторим автоматически через ${minutes} мин.`,
						title: 'Слишком много попыток.',
						tone: 'danger'
					});
				}

				case 'network':
				case 'unexpected':
					return failed({ icon: 'alert', text: state.message, tone: 'danger' }, { kind: 'restart', label: TRY_AGAIN });
			}
	}
}
