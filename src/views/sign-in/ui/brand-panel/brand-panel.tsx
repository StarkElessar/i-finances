import css from './brand-panel.module.scss';

import { cn } from '~/shared/lib';
import { Typography } from '~/shared/ui';

export function BrandPanel() {
    return (
        <div class={css.item}>
            <div class={css.logo}>iF</div>
            <Typography class={css.title} variant='heading-1'>Семейные финансы без лишнего</Typography>
            <Typography class={css.description} tone='primary' variant='body-lg'>
                Счета, операции и бюджеты в одном приватном пространстве для вашей семьи.
            </Typography>

            <div class={cn(css.privacy, css.subItem)}>
                <Typography variant='label' tone='tertiary'>Приватность</Typography>
                <Typography tone='primary' variant='body-lg'>
                    Биометрия остаётся на устройстве и никогда не передаётся приложению.
                </Typography>
            </div>

            <div class={css.subItem}>
                <Typography variant='label' tone='tertiary'>Доступ с устройств</Typography>
                <Typography variant='body-lg' tone='primary'>
                    Можно добавить отдельные ключи для телефона, ноутбука и резервного устройства.
                </Typography>
            </div>
        </div>
    );
}
