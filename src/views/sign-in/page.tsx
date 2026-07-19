import css from './sign-in.module.scss';

import { createSignal, Show } from 'solid-js';

import { cn } from '~/shared/lib';
import { Button, Container, Typography } from '~/shared/ui';
import { BrandPanel } from '~/views/sign-in/ui/brand-panel';

function PasswordLogin() {
    return (
        <div>
            pasword
        </div>
    );
}

export function SignInPage() {
    const [shouldShowPasswordLogin, setShouldShowPasswordLogin] = createSignal(false);
    return (
        <div class={css.page}>
            <Container>
                <div class={css.wrapper}>
                    <BrandPanel/>
                    <Show
                        when={!shouldShowPasswordLogin()}
                        fallback={<PasswordLogin/>}
                    >
                        <div class={cn(css.item, css.welcome)}>
                            <div class={css.id}>Id</div>
                            <Typography class={css.title} variant='heading-1'>Добро пожаловать</Typography>
                            <Typography class={css.welcomeDescription} variant='body-lg' tone='secondary'>
                                Используйте ключ доступа, сохранённый на этом или другом устройстве.
                            </Typography>
                            <Button type='button' fullWidth>Войти с ключом доступа</Button>
                            <div class={css.or} data-text='или'/>
                            <Button type='button' fullWidth variant='secondary' onClick={() => setShouldShowPasswordLogin(true)}>
                                Войти по логину и паролю
                            </Button>
                            <Typography class={css.noKey} variant='body-sm' tone='secondary'>
                                Нет ключа? Резервный вход позволит создать его после авторизации.
                            </Typography>
                        </div>
                    </Show>
                </div>
            </Container>
        </div>
    );
}
