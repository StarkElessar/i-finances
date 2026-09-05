import css from './sign-in-shell.module.scss';

import { Container } from '@/shared/ui';

import { createSignal, Show } from 'solid-js';

import type { AuthClient } from '../api';

import { BrandPanel } from './brand-panel';
import { PasskeySignInPanel } from './passkey-sign-in-panel';
import { PasswordSignInPanel } from './password-sign-in-panel';

export type SignInFormProps = {
	client: AuthClient;
	onSignedIn: () => void;
};

export function SignInForm(props: SignInFormProps) {
	const [method, setMethod] = createSignal<'passkey' | 'password'>('passkey');

	return (
		<div class={css.page}>
			<Container useMaxSize>
				<div class={css.wrapper}>
					<BrandPanel classRoot={css.welcome}/>
					<Show
						when={method() === 'password'}
						fallback={(
							<PasskeySignInPanel
								client={props.client}
								onSignedIn={props.onSignedIn}
								onUsePassword={() => setMethod('password')}
							/>
						)}
					>
						<PasswordSignInPanel client={props.client} onSignedIn={props.onSignedIn} onUsePasskey={() => setMethod('passkey')}/>
					</Show>
				</div>
			</Container>
		</div>
	);
}
