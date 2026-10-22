import css from './telegram-link-confirmation.module.scss';

import { Banner } from '@/shared/ui';

import { CircleCheck, TriangleAlert } from 'lucide-solid';
import { Show } from 'solid-js';

const FOREIGN_TELEGRAM_ADVICE = 'Владелец этого Telegram сможет входить в ваш аккаунт, пока привязку не снимут, а снять её можно '
	+ 'только на сервере. Сразу сообщите владельцу окружения, а до этого завершайте незнакомые сеансы в списке ниже '
	+ '(«Завершить все остальные»).';

export type TelegramLinkConfirmationProps = {
	/** The Telegram name without `@` as the server answered it, `null` when the account has none. */
	username: string | null;
};

/**
 * Shown right after Telegram was linked: the linked name, large, and what to do if it is not the person's own. A link
 * code can be pressed by somebody else first (decision A4 of the review, Р11), and there is no unlinking in v1, so the
 * person must see whose Telegram it now is. Ending sessions does not undo a foreign link (its owner can sign in again),
 * so the text sends the person to the owner of the household: the link is removed by the server script (Р10).
 */
export function TelegramLinkConfirmation(props: TelegramLinkConfirmationProps) {
	return (
		<div class={css.root}>
			<Banner icon={<CircleCheck/>} role='status' title='Telegram привязан.' tone='success'>
				Теперь можно входить в один клик.
			</Banner>
			<div class={css.identity}>
				<span class={css.caption}>Привязан Telegram</span>
				<Show fallback={<b class={css.noName}>Аккаунт без имени пользователя</b>} when={props.username}>
					{(username) => <b class={css.username}>@{username()}</b>}
				</Show>
			</div>
			<Banner icon={<TriangleAlert/>} role='alert' title='Это не ваш Telegram?' tone='warning'>
				{FOREIGN_TELEGRAM_ADVICE}
			</Banner>
		</div>
	);
}
