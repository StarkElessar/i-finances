import css from './passkey-registration-menu-item.module.scss';

import {
    browserSupportsWebAuthn,
    startRegistration
} from '@simplewebauthn/browser';
import { createSignal, Show } from 'solid-js';

import { passkeyRegistrationResultSchema } from '~/features/passkey-registration/api/passkey-registration.contract';
import { cn } from '~/shared/lib';
import { ContextMenu } from '~/shared/ui';

type RegistrationStatus = 'idle' | 'success' | 'error';

/**
 * Returns a user-facing message for browser-side WebAuthn registration errors.
 */
function resolveRegistrationErrorMessage(error: unknown): string {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
        return 'Создание ключа доступа отменено.';
    }

    return 'Не удалось создать ключ доступа. Попробуйте ещё раз.';
}

/**
 * Starts passkey enrollment for the current authenticated user from a profile menu.
 */
export function PasskeyRegistrationMenuItem() {
    const [isPending, setIsPending] = createSignal(false);
    const [message, setMessage] = createSignal<string>();
    const [status, setStatus] = createSignal<RegistrationStatus>('idle');
    const feedbackRole = () => status() === 'error' ? 'alert' : 'status';

    const setFailure = (nextMessage: string): void => {
        setStatus('error');
        setMessage(nextMessage);
    };
    const handleRegister = async (): Promise<void> => {
        if (!browserSupportsWebAuthn()) {
            setFailure('Этот браузер не поддерживает ключи доступа.');
            return;
        }

        setIsPending(true);
        setStatus('idle');
        setMessage(undefined);

        try {
            const optionsResponse = await fetch('/api/auth/passkey/registration/options', {
                method: 'post',
                credentials: 'same-origin',
                headers: {
                    accept: 'application/json'
                }
            });
            const options = await optionsResponse.json();

            if (!optionsResponse.ok) {
                setFailure('Не удалось подготовить создание ключа доступа.');
                return;
            }

            const registrationResponse = await startRegistration({ optionsJSON: options });
            const verificationResponse = await fetch('/api/auth/passkey/registration/verification', {
                method: 'post',
                body: JSON.stringify({
                    response: registrationResponse
                }),
                credentials: 'same-origin',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/json'
                }
            });
            const parsedResult = passkeyRegistrationResultSchema.safeParse(await verificationResponse.json());

            if (!parsedResult.success) {
                setFailure('Не удалось прочитать ответ сервера.');
                return;
            }

            if (!parsedResult.data.ok) {
                setFailure(parsedResult.data.message ?? 'Не удалось сохранить ключ доступа.');
                return;
            }

            setStatus('success');
            setMessage('Ключ доступа добавлен.');
        }
        catch (error: unknown) {
            setFailure(resolveRegistrationErrorMessage(error));
        }
        finally {
            setIsPending(false);
        }
    };

    return (
        <div class={css.root}>
            <ContextMenu.Item closeOnSelect={false} disabled={isPending()} onSelect={handleRegister}>
                {isPending() ? 'Создаём ключ доступа...' : 'Добавить ключ доступа'}
            </ContextMenu.Item>
            <Show when={message()}>
                {(feedback) => (
                    <p
                        class={cn(css.feedback, status() === 'error' && css.feedbackError)}
                        role={feedbackRole()}
                    >
                        {feedback()}
                    </p>
                )}
            </Show>
        </div>
    );
}
