import css from './passkey-sign-in-panel.module.scss';

import { Button, Typography } from '@/shared/ui';

import type { AuthClient } from '@/features/auth/api';

import { passkeySignInErrorMessageByCode } from '@i-finances/contracts';
import { createSignal, Show } from 'solid-js';

import { IdentityBadge } from './identity-badge';

export type PasskeySignInPanelProps = {
	client: AuthClient;
	onSignedIn: () => void;
	onUsePassword: () => void;
};

export function PasskeySignInPanel(props: PasskeySignInPanelProps) {
	const [error, setError] = createSignal<string>();
	const [isPending, setIsPending] = createSignal(false);

	const handlePasskeySignIn = async (): Promise<void> => {
		if (!props.client.supportsPasskeys()) {
			setError(passkeySignInErrorMessageByCode['not-supported']);
			return;
		}

		setError(undefined);
		setIsPending(true);

		try {
			const result = await props.client.signInWithPasskey();

			if (result.ok) {
				props.onSignedIn();
				return;
			}

			setError(result.message);
		}
		catch (caughtError: unknown) {
			setError(
				caughtError instanceof DOMException && caughtError.name === 'NotAllowedError'
					? passkeySignInErrorMessageByCode.cancelled
					: passkeySignInErrorMessageByCode.unexpected
			);
		}
		finally {
			setIsPending(false);
		}
	};

	return (
		<div class={css.root}>
			<IdentityBadge/>
			<Typography as='h2' class={css.title} variant='heading-1'>Добро пожаловать</Typography>
			<Typography class={css.welcomeDescription} variant='body-lg' tone='secondary'>
				Используйте ключ доступа, сохранённый на этом или другом устройстве.
			</Typography>
			<Button type='button' fullWidth loading={isPending()} onClick={handlePasskeySignIn}>
				Войти с ключом доступа
			</Button>
			<Show when={error()}>{(content) => <p class={css.error} role='alert'>{content()}</p>}</Show>
			<div class={css.or} data-text='или'/>
			<Button type='button' fullWidth variant='secondary' disabled={isPending()} onClick={props.onUsePassword}>
				Войти по логину и паролю
			</Button>
			<Typography class={css.noKey} variant='body-sm' tone='secondary'>
				Нет ключа? Резервный вход позволит создать его после авторизации.
			</Typography>
		</div>
	);
}
