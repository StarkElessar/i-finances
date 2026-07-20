import css from './sign-in.module.scss';

import { createSignal, Show } from 'solid-js';

import { Container } from '~/shared/ui';
import { BrandPanel } from '~/views/sign-in/ui/brand-panel';
import { PasskeySignInPanel } from '~/views/sign-in/ui/passkey-sign-in-panel';
import { PasswordSignInPanel } from '~/views/sign-in/ui/password-sign-in-panel';

/**
 * Available sign-in methods rendered inside the authentication shell.
 */
type SignInMethod = 'passkey' | 'password';

/**
 * Composes the page-local authentication panels and method navigation.
 */
export function SignInPage() {
    const [method, setMethod] = createSignal<SignInMethod>('passkey');

    /**
     * Opens the password fallback panel.
     */
    const showPasswordSignIn = (): void => {
        setMethod('password');
    };

    /**
     * Returns to the preferred passkey panel.
     */
    const showPasskeySignIn = (): void => {
        setMethod('passkey');
    };

    return (
        <div class={css.page}>
            <Container>
                <div class={css.wrapper}>
                    <BrandPanel/>
                    <Show
                        when={method() === 'password'}
                        fallback={<PasskeySignInPanel onUsePassword={showPasswordSignIn}/>}
                    >
                        <PasswordSignInPanel onUsePasskey={showPasskeySignIn}/>
                    </Show>
                </div>
            </Container>
        </div>
    );
}
