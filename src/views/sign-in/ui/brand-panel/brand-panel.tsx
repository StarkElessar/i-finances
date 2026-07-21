import css from './brand-panel.module.scss';

import { cn } from '~/shared/lib';
import { Typography } from '~/shared/ui';

/**
 * Presents the product promise and privacy context beside the sign-in flow.
 */
export function BrandPanel(props: { classRoot?: string }) {
    return (
        <div class={cn(css.root, props.classRoot)}>
            <div class={css.intro}>
                <div class={css.logo}>iF</div>
                <Typography class={css.title} variant='heading-1'>Семейные финансы без лишнего</Typography>
                <Typography tone='primary' variant='body-lg'>
                    Счета, операции и бюджеты в одном приватном пространстве для вашей семьи.
                </Typography>
            </div>

            <div class={css.details}>
                <div class={cn(css.privacy, css.item)}>
                    <Typography variant='label' tone='tertiary'>Приватность</Typography>
                    <Typography tone='primary' variant='body-lg'>
                        Биометрия остаётся на устройстве и никогда не передаётся приложению.
                    </Typography>
                </div>

                <div class={css.item}>
                    <Typography variant='label' tone='tertiary'>Доступ с устройств</Typography>
                    <Typography variant='body-lg' tone='primary'>
                        Можно добавить отдельные ключи для телефона, ноутбука и резервного устройства.
                    </Typography>
                </div>
            </div>
        </div>
    );
}
