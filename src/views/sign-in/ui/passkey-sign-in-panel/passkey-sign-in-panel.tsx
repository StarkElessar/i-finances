import css from './passkey-sign-in-panel.module.scss';

import { Button, Typography } from '~/shared/ui';
import { IdentityBadge } from '~/views/sign-in/ui/identity-badge';

/**
 * Navigation callbacks used by the passkey-first panel.
 */
export type PasskeySignInPanelProps = {
    onUsePassword: () => void;
};

/**
 * Presents passkey as the primary sign-in method with a password fallback.
 */
export function PasskeySignInPanel(props: PasskeySignInPanelProps) {
    return (
        <div class={css.root}>
            <IdentityBadge/>
            <Typography as='h2' class={css.title} variant='heading-1'>Добро пожаловать</Typography>
            <Typography class={css.welcomeDescription} variant='body-lg' tone='secondary'>
                Используйте ключ доступа, сохранённый на этом или другом устройстве.
            </Typography>
            <Button type='button' fullWidth>Войти с ключом доступа</Button>
            <div class={css.or} data-text='или'/>
            <Button type='button' fullWidth variant='secondary' onClick={props.onUsePassword}>
                Войти по логину и паролю
            </Button>
            <Typography class={css.noKey} variant='body-sm' tone='secondary'>
                Нет ключа? Резервный вход позволит создать его после авторизации.
            </Typography>
        </div>
    );
}
