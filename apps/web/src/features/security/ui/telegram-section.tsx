import type { ViewerTelegram } from '@/entities/viewer';

import { Show, untrack } from 'solid-js';

import type { TelegramLinkGateway } from '../model/telegram-link-protocol';

import { SecuritySection } from './security-section';
import { TelegramLinkSection } from './telegram-link-section';
import { TelegramLinkedRow } from './telegram-linked-row';

export type TelegramSectionProps = {
	gateway: TelegramLinkGateway;
	/** What the session says now. */
	telegram: ViewerTelegram | null;
	onLinked: (telegram: ViewerTelegram) => void;
};

/**
 * The Telegram block of «Безопасность» (U6): the linked name for an account that has one, otherwise the link flow. Which of
 * the two is decided once, when the dialog opens, so the flow that has just linked Telegram keeps the screen to show the
 * linked name large instead of being replaced by the plain row the moment the viewer is patched.
 */
export function TelegramSection(props: TelegramSectionProps) {
	const hadTelegram = untrack(() => props.telegram !== null);

	return (
		<Show
			fallback={<TelegramLinkSection gateway={props.gateway} onLinked={props.onLinked}/>}
			when={hadTelegram ? props.telegram : undefined}
		>
			{(telegram) => (
				<SecuritySection title='Telegram'>
					<TelegramLinkedRow username={telegram().username}/>
				</SecuritySection>
			)}
		</Show>
	);
}
