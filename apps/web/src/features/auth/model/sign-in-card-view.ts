import type { BannerTone } from '@/shared/ui';

import { formatMinutesAccusative, formatMinutesGenitive } from './format-minutes';
import type { TelegramSignInState } from './telegram-sign-in-state';

const SECONDS_PER_MINUTE = 60;

/** The board names the 10 minutes of the default request lifetime; the real lifetime comes from `start`. */
const DEFAULT_TTL_MINUTES = 10;

export type SignInBannerIcon = 'alert' | 'clock' | 'send' | 'wifi-off';

export type SignInBannerView = {
	icon: SignInBannerIcon;
	text: string;
	title?: string;
	tone: BannerTone;
};

export type SignInTelegramAction =
	/** The bot link (`ButtonLink`): pressing it starts the waiting. */
	| { kind: 'link'; label: string }
	/** The link is being prepared: a disabled button with a spinner. */
	| { kind: 'loading' }
	/** A disabled button: too many attempts. */
	| { kind: 'disabled' }
	/** A button that starts a new request. */
	| { kind: 'restart'; label: string }
	| { kind: 'none' };

/**
 * What the sign-in card shows for a Telegram state: one entry per card of the `Auth-Telegram` board, with the main
 * state worded as on `M-SignIn` and `D-SignIn`.
 */
export type SignInCardView = {
	banners: SignInBannerView[];
	description?: string;
	/**
	 * The «или» line: under Telegram, before the other ways (cards 1, 2); between the passkey and the password when
	 * there is no Telegram (card 9).
	 */
	divider: 'after-passkey' | 'after-telegram' | 'none';
	/** «Аккаунт создаётся при первом входе через Telegram.» under the card. */
	hasRegistrationHint: boolean;
	/** «Отмена» under the link while waiting. */
	isCancellable: boolean;
	passkey: 'none' | 'secondary';
	password: 'ghost' | 'none' | 'secondary';
	telegram: SignInTelegramAction;
	title: string;
};

const WELCOME = 'Добро пожаловать';

const TELEGRAM_DESCRIPTION = 'Подтвердите вход в Telegram одним нажатием. Пароль не нужен.';

const SIGN_IN_WITH_TELEGRAM = 'Войти через Telegram';

const TRY_AGAIN = 'Попробовать снова';

/** Card 1 and 2: Telegram first, then the passkey and the password. */
function mainCard(telegram: SignInTelegramAction, description: string): SignInCardView {
	return {
		banners: [],
		description,
		divider: 'after-telegram',
		hasRegistrationHint: true,
		isCancellable: false,
		passkey: 'secondary',
		password: 'ghost',
		telegram,
		title: WELCOME
	};
}

/** A failure the person can only start over from (cards 4, 5, 6). */
function restartCard(banner: SignInBannerView, label: string): SignInCardView {
	return {
		banners: [banner],
		divider: 'none',
		hasRegistrationHint: false,
		isCancellable: false,
		passkey: 'none',
		password: 'none',
		telegram: { kind: 'restart', label },
		title: WELCOME
	};
}

/** A failure that leaves the passkey and the password (card 7 and the ones the board has no picture for). */
function otherWaysCard(banner: SignInBannerView, telegram: SignInTelegramAction): SignInCardView {
	return {
		banners: [banner],
		divider: telegram.kind === 'none' ? 'none' : 'after-telegram',
		hasRegistrationHint: false,
		isCancellable: false,
		passkey: 'secondary',
		password: 'ghost',
		telegram,
		title: WELCOME
	};
}

export function describeSignInCard(state: TelegramSignInState): SignInCardView {
	switch (state.kind) {
		case 'idle':
		case 'preparing':
			return mainCard({ kind: 'loading' }, 'Готовим вход через Telegram.');

		case 'ready':
			return mainCard({ kind: 'link', label: SIGN_IN_WITH_TELEGRAM }, TELEGRAM_DESCRIPTION);

		case 'waiting': {
			const banners: SignInBannerView[] = [{
				icon: 'send',
				text: `Откройте бота и нажмите «Войти». Заявка действует ${formatMinutesAccusative(state.link.ttlMinutes)}.`,
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
				banners,
				divider: 'none',
				hasRegistrationHint: false,
				isCancellable: true,
				passkey: 'none',
				password: 'none',
				telegram: { kind: 'link', label: 'Открыть Telegram ещё раз' },
				title: 'Ждём подтверждения в Telegram'
			};
		}

		case 'confirmed':
			// The card shows the signed-in identity instead (`SignedInIdentity`); this is only the frame around it.
			return {
				banners: [],
				divider: 'none',
				hasRegistrationHint: false,
				isCancellable: false,
				passkey: 'none',
				password: 'none',
				telegram: { kind: 'none' },
				title: WELCOME
			};

		case 'unavailable':
			// Card 9: Telegram is off on the server, so there is no button at all.
			return {
				banners: [],
				description: 'Используйте ключ доступа, сохранённый на этом или другом устройстве.',
				divider: 'after-passkey',
				hasRegistrationHint: false,
				isCancellable: false,
				passkey: 'secondary',
				password: 'secondary',
				telegram: { kind: 'none' },
				title: WELCOME
			};

		case 'failed':
			switch (state.reason) {
				case 'expired':
					return restartCard({
						icon: 'clock',
						text: `Прошло больше ${formatMinutesGenitive(state.ttlMinutes ?? DEFAULT_TTL_MINUTES)}. Начните вход заново.`,
						title: 'Ссылка устарела.',
						tone: 'warning'
					}, TRY_AGAIN);

				case 'browser-mismatch':
					return restartCard({
						icon: 'alert',
						text: 'Откройте i-finances там, где нажали «Войти через Telegram», или начните заново.',
						title: 'Вход начат в другом браузере.',
						tone: 'danger'
					}, 'Начать заново');

				case 'rejected':
					return restartCard({
						icon: 'alert',
						text: 'Если это были не вы, ничего делать не нужно.',
						title: 'Вы отклонили вход в Telegram.',
						tone: 'warning'
					}, TRY_AGAIN);

				case 'registration-closed':
					return otherWaysCard({
						icon: 'alert',
						text: 'Регистрация закрыта. Войдите паролем или ключом доступа и привяжите Telegram в разделе «Безопасность».',
						title: 'Аккаунт не найден.',
						tone: 'danger'
					}, { kind: 'none' });

				case 'rate-limited': {
					const minutes = Math.max(1, Math.ceil((state.retryAfterSeconds ?? SECONDS_PER_MINUTE) / SECONDS_PER_MINUTE));

					// Card 8. The board leaves only the passkey under it; the password stays too, it has its own limit.
					return {
						...otherWaysCard({
							icon: 'alert',
							text: `Повторите через ${formatMinutesAccusative(minutes)}.`,
							title: 'Слишком много попыток.',
							tone: 'danger'
						}, { kind: 'disabled' }),
						description: 'Подтвердите вход в Telegram одним нажатием.',
						divider: 'none'
					};
				}

				case 'network':
					return otherWaysCard({
						icon: 'wifi-off',
						text: 'Проверьте соединение и попробуйте снова.',
						title: 'Не удалось подготовить вход через Telegram.',
						tone: 'danger'
					}, { kind: 'restart', label: TRY_AGAIN });

				case 'account-disabled':
					return otherWaysCard({ icon: 'alert', text: state.message, tone: 'danger' }, { kind: 'none' });

				case 'unexpected':
					return otherWaysCard({ icon: 'alert', text: state.message, tone: 'danger' }, { kind: 'restart', label: TRY_AGAIN });
			}
	}
}
