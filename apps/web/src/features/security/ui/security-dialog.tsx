import css from './security-dialog.module.scss';

import { Dialog } from '@/shared/ui';

import { useCurrentViewer, useSetCurrentViewer } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';

import { createSignal } from 'solid-js';

import { SecurityClient, TelegramLinkClient } from '../api';
import { describeThisDevice } from '../model/describe-this-device';

import { PasskeysSection } from './passkeys-section';
import { PasswordSection } from './password-section';
import { SessionsSection } from './sessions-section';
import { TelegramSection } from './telegram-section';

export type SecurityDialogProps = {
	/** Passkey registration and the session read that recovers a lost Telegram link answer. */
	authClient: Pick<AuthClient, 'currentSession' | 'registerPasskey' | 'supportsPasskeys'>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	securityClient?: SecurityClient;
	telegramLinkClient?: TelegramLinkClient;
};

/**
 * The «Безопасность» section: Telegram, passkeys, password and active sessions (mockup `M-Security` as a bottom sheet,
 * `D-Security` as a 560 px dialog; rule S4: the confirmations live inside, not in a second layer). The viewer snapshot is
 * patched in place when Telegram is linked, never by refetching the session.
 */
export function SecurityDialog(props: SecurityDialogProps) {
	const viewer = useCurrentViewer();
	const setCurrentViewer = useSetCurrentViewer();
	const securityClient = props.securityClient ?? new SecurityClient();
	const telegramLinkClient = props.telegramLinkClient ?? new TelegramLinkClient();
	const [sessionsReloadKey, setSessionsReloadKey] = createSignal(0);

	const telegramGateway = {
		cancelTelegramLink: (code: string) => telegramLinkClient.cancelTelegramLink(code),
		completeTelegramLink: (code: string) => telegramLinkClient.completeTelegramLink(code),
		currentSession: () => props.authClient.currentSession(),
		startTelegramLink: () => telegramLinkClient.startTelegramLink()
	};

	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content class={css.content}>
				<Dialog.Header closeLabel='Закрыть раздел «Безопасность»'>
					<Dialog.Title>Безопасность</Dialog.Title>
					<Dialog.Description>Вход и доступ к аккаунту</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body class={css.sections}>
					<TelegramSection
						gateway={telegramGateway}
						telegram={viewer()?.telegram ?? null}
						onLinked={(telegram) => setCurrentViewer({ telegram })}
					/>
					<PasskeysSection
						client={securityClient}
						isSupported={props.authClient.supportsPasskeys()}
						register={() => props.authClient.registerPasskey(describeThisDevice(navigator.userAgent))}
					/>
					<PasswordSection
						change={(input) => securityClient.changePassword(input)}
						hasPassword={viewer()?.hasPassword ?? false}
						onChanged={() => setSessionsReloadKey((key) => key + 1)}
					/>
					<SessionsSection client={securityClient} reloadKey={sessionsReloadKey()}/>
				</Dialog.Body>
			</Dialog.Content>
		</Dialog.Root>
	);
}
