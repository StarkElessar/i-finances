import css from './sign-in.module.scss';

import { useSearchParams } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';

import { Container } from '~/shared/ui';
import type { PasswordSignInErrorCode } from '~/views/sign-in/api/password-sign-in.contract';
import {
    passwordSignInErrorCodes,
    passwordSignInErrorMessageByCode
} from '~/views/sign-in/api/password-sign-in.contract';
import { BrandPanel } from '~/views/sign-in/ui/brand-panel';
import { PasskeySignInPanel } from '~/views/sign-in/ui/passkey-sign-in-panel';
import { PasswordSignInPanel } from '~/views/sign-in/ui/password-sign-in-panel';

/**
 * Available sign-in methods rendered inside the authentication shell.
 */
type SignInMethod = 'passkey' | 'password';

/**
 * Reads the first value from Solid Router query params.
 */
function readSearchParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/**
 * Checks whether a query value is a known password sign-in error.
 */
function isPasswordSignInErrorCode(value: string | undefined): value is PasswordSignInErrorCode {
    return Boolean(value && passwordSignInErrorCodes.includes(value as PasswordSignInErrorCode));
}

/**
 * Composes the page-local authentication panels and method navigation.
 */
export function SignInPage() {
    const [searchParams] = useSearchParams();
    const passwordErrorCode = () => readSearchParam(searchParams.error);
    const passwordErrorMessage = () => {
        const errorCode = passwordErrorCode();

        return isPasswordSignInErrorCode(errorCode)
            ? passwordSignInErrorMessageByCode[errorCode]
            : undefined;
    };
    const initialMethod = readSearchParam(searchParams.method) === 'password' || passwordErrorMessage()
        ? 'password'
        : 'passkey';
    const [method, setMethod] = createSignal<SignInMethod>(initialMethod);

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
                        fallback={<PasskeySignInPanel onUsePassword={showPasswordSignIn} returnTo={readSearchParam(searchParams.from)}/>}
                    >
                        <PasswordSignInPanel
                            initialError={passwordErrorMessage()}
                            onUsePasskey={showPasskeySignIn}
                            returnTo={readSearchParam(searchParams.from)}
                        />
                    </Show>
                </div>
            </Container>
        </div>
    );
}
