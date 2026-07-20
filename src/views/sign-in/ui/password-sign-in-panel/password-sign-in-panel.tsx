import css from './password-sign-in-panel.module.scss';

import { createSignal } from 'solid-js';

import { Button, TextField, Typography } from '~/shared/ui';
import { IdentityBadge } from '~/views/sign-in/ui/identity-badge';

/**
 * Navigation callbacks used by the password fallback panel.
 */
export type PasswordSignInPanelProps = {
    onUsePasskey: () => void;
};

/**
 * Presents the password fallback form without leaving the sign-in page.
 */
export function PasswordSignInPanel(props: PasswordSignInPanelProps) {
    const [login, setLogin] = createSignal('');
    const [password, setPassword] = createSignal('');

    /**
     * Keeps the static prototype on-page until the server action is connected.
     */
    function handleSubmit(event: SubmitEvent): void {
        event.preventDefault();
    }

    return (
        <div class={css.root}>
            <IdentityBadge/>
            <Typography as='h2' class={css.title} variant='heading-1'>Войти в аккаунт</Typography>
            <Typography class={css.description} variant='body-lg' tone='secondary'>
                Используйте данные резервного входа. После авторизации можно создать ключ доступа.
            </Typography>

            <form class={css.form} onSubmit={handleSubmit}>
                <TextField
                    autocomplete='username'
                    label='Логин'
                    name='username'
                    onInput={(event) => setLogin(event.currentTarget.value)}
                    placeholder='Введите логин'
                    required
                    value={login()}
                />
                <TextField
                    autocomplete='current-password'
                    hint='Не менее 12 символов'
                    label='Пароль'
                    name='password'
                    onInput={(event) => setPassword(event.currentTarget.value)}
                    placeholder='Введите пароль'
                    required
                    type='password'
                    value={password()}
                />
                <Button type='submit' fullWidth>Войти</Button>
            </form>

            <div class={css.or} data-text='или'/>

            <Button type='button' fullWidth variant='secondary' onClick={props.onUsePasskey}>
                Вернуться к входу с ключом доступа
            </Button>

            <Typography class={css.notice} variant='body-sm' tone='secondary'>
                Пароль не сохраняется на устройстве.
            </Typography>
        </div>
    );
}
