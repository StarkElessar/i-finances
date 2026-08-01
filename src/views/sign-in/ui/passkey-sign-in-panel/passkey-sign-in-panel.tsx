import css from './passkey-sign-in-panel.module.scss';

import {
	browserSupportsWebAuthn,
	startAuthentication
} from '@simplewebauthn/browser';
import { createSignal, Show } from 'solid-js';

import { Button, Typography } from '~/shared/ui';
import {
	passkeySignInErrorMessageByCode,
	passkeySignInResultSchema
} from '~/views/sign-in/api/passkey-sign-in.contract';
import { IdentityBadge } from '~/views/sign-in/ui/identity-badge';

/**
 * Navigation callbacks used by the passkey-first panel.
 */
export type PasskeySignInPanelProps = {
	onUsePassword: () => void;
	returnTo?: string;
};

/**
 * Returns the most useful passkey error message for the current browser failure.
 */
function resolvePasskeyErrorMessage(error: unknown): string {
	if (error instanceof DOMException && error.name === 'NotAllowedError') {
		return passkeySignInErrorMessageByCode.cancelled;
	}

	return passkeySignInErrorMessageByCode.unexpected;
}

/**
 * Presents passkey as the primary sign-in method with a password fallback.
 */
export function PasskeySignInPanel(props: PasskeySignInPanelProps) {
	const [error, setError] = createSignal<string>();
	const [isPending, setIsPending] = createSignal(false);

	const handlePasskeySignIn = async (): Promise<void> => {
		if (!browserSupportsWebAuthn()) {
			setError(passkeySignInErrorMessageByCode['not-supported']);
			return;
		}

		setError(undefined);
		setIsPending(true);

		try {
			const optionsResponse = await fetch('/api/auth/passkey/sign-in/options', {
				method: 'post',
				credentials: 'same-origin',
				headers: {
					accept: 'application/json'
				}
			});
			const options = await optionsResponse.json();

			if (!optionsResponse.ok) {
				const parsedResult = passkeySignInResultSchema.safeParse(options);

				setError(parsedResult.success && !parsedResult.data.ok
					? parsedResult.data.message
					: passkeySignInErrorMessageByCode.unexpected);
				return;
			}

			const authenticationResponse = await startAuthentication({ optionsJSON: options });
			const verificationResponse = await fetch('/api/auth/passkey/sign-in/verification', {
				method: 'post',
				body: JSON.stringify({
					response: authenticationResponse,
					returnTo: props.returnTo
				}),
				credentials: 'same-origin',
				headers: {
					accept: 'application/json',
					'content-type': 'application/json'
				}
			});
			const parsedResult = passkeySignInResultSchema.safeParse(await verificationResponse.json());

			if (!parsedResult.success) {
				setError(passkeySignInErrorMessageByCode.unexpected);
				return;
			}

			if (parsedResult.data.ok) {
				window.location.assign(parsedResult.data.redirectTo);
				return;
			}

			setError(parsedResult.data.message);
		}
		catch (caughtError: unknown) {
			setError(resolvePasskeyErrorMessage(caughtError));
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
			<Show when={error()}>
				{(content) => <p class={css.error} role='alert'>{content()}</p>}
			</Show>
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
