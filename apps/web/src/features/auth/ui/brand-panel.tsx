import css from './brand-panel.module.scss';

import { cn } from '@/shared/lib';
import { AppLogo, Typography } from '@/shared/ui';

/**
 * The brand side of the sign-in (mockup `M-SignIn`: logo, title and text above the card; `D-SignIn`: the left half
 * of the card on the soft primary background, with the two notes at the bottom).
 */
export function BrandPanel(props: { classRoot?: string }) {
	return (
		<div class={cn(css.root, props.classRoot)}>
			<div class={css.intro}>
				<AppLogo size='lg'/>
				<Typography as='h1' variant='display'>Семейные финансы без лишнего</Typography>
				<Typography class={css.lead} tone='secondary' variant='body-lg'>
					Счета, операции и бюджеты в одном приватном пространстве для вашей семьи.
				</Typography>
			</div>
			<div class={css.details}>
				<div class={css.item}>
					<Typography tone='tertiary' variant='label'>Приватность</Typography>
					<Typography tone='primary' variant='body-md'>
						Биометрия остаётся на устройстве и никогда не передаётся приложению.
					</Typography>
				</div>
				<div class={css.item}>
					<Typography tone='tertiary' variant='label'>Доступ с устройств</Typography>
					<Typography tone='primary' variant='body-md'>
						Можно добавить отдельные ключи для телефона, ноутбука и резервного устройства.
					</Typography>
				</div>
			</div>
		</div>
	);
}
