import css from './ui-kit.module.scss';

import { cn } from '~/shared/lib';
import { Button } from '~/shared/ui/button';
import { TextField } from '~/shared/ui/text-field';
import { Typography } from '~/shared/ui/typography';

import { Title } from '@solidjs/meta';

/**
 * Renders the living reference page for the iFinances design system.
 */
export function UiKitPage() {
	return (
		<div class={css.page}>
			<Title>UI Kit — iFinances</Title>

			<div class={css.content}>
				<header class={css.hero}>
					<Typography tone='tertiary' variant='label'>iFinances design system · 0.1</Typography>
					<Typography class={css.title} variant='display'>Спокойный интерфейс для ежедневных финансов</Typography>
					<Typography class={css.intro} tone='secondary' variant='body-lg'>
						Система построена вокруг компактной плотности, ясной иерархии и доступных интерактивных состояний.
						Одинаковая шкала размеров связывает кнопки, поля и будущие селекты.
					</Typography>
				</header>

				<section class={css.section}>
					<div class={css.sectionHeading}>
						<Typography variant='heading-2'>Кнопки</Typography>
						<Typography tone='secondary'>Четыре визуальных варианта и единая размерная сетка.</Typography>
					</div>

					<div class={css.componentGrid}>
						<div class={css.panel}>
							<Typography variant='heading-3'>Варианты</Typography>
							<div class={css.controlRow}>
								<Button>Основная</Button>
								<Button variant='secondary'>Вторичная</Button>
								<Button variant='ghost'>Ghost</Button>
								<Button variant='danger'>Опасное действие</Button>
							</div>
						</div>
						<div class={css.panel}>
							<Typography variant='heading-3'>Размеры и состояния</Typography>
							<div class={css.controlRow}>
								<Button size='sm'>Small</Button>
								<Button size='md'>Medium</Button>
								<Button size='lg'>Large</Button>
								<Button loading>Сохранение</Button>
								<Button disabled variant='secondary'>Disabled</Button>
							</div>
						</div>
					</div>
				</section>

				<section class={css.section}>
					<div class={css.sectionHeading}>
						<Typography variant='heading-2'>Поля ввода</Typography>
						<Typography tone='secondary'>Outline и Filled режимы с едиными состояниями.</Typography>
					</div>

					<div class={css.fieldGrid}>
						<div class={css.panel}>
							<Typography variant='heading-3'>Базовые</Typography>
							<TextField label='Логин' placeholder='Введите логин' required/>
							<TextField
								endContent={<span class={css.fieldSuffix}>BYN</span>}
								label='Сумма'
								placeholder='0,00'
								size='lg'
							/>
						</div>
						<div class={css.panel}>
							<Typography variant='heading-3'>Состояния</Typography>
							<TextField label='Поиск' placeholder='Категория, получатель или комментарий' size='sm' variant='filled'/>
							<TextField error='Минимум 12 символов' label='Пароль' type='password' value='short'/>
							<TextField label='Расчётный курс' readOnly value='3,268 BYN / USD'/>
						</div>
					</div>
				</section>

				<section class={css.section}>
					<div class={css.sectionHeading}>
						<Typography variant='heading-2'>Типографика</Typography>
						<Typography tone='secondary'>Набор пресетов для заголовков, текста и меток интерфейса.</Typography>
					</div>

					<div class={css.panel}>
						<div class={css.typeRow}>
							<Typography tone='tertiary' variant='caption'>display</Typography>
							<Typography variant='display'>Семейные финансы</Typography>
						</div>
						<div class={css.typeRow}>
							<Typography tone='tertiary' variant='caption'>heading-2</Typography>
							<Typography variant='heading-2'>Операции за месяц</Typography>
						</div>
						<div class={css.typeRow}>
							<Typography tone='tertiary' variant='caption'>body-md</Typography>
							<Typography>Основной текст строк, форм и карточек.</Typography>
						</div>
						<div class={css.typeRow}>
							<Typography tone='tertiary' variant='caption'>caption</Typography>
							<Typography tone='secondary' variant='caption'>Обновлено сегодня в 13:30</Typography>
						</div>
					</div>
				</section>

				<section class={css.section}>
					<div class={css.sectionHeading}>
						<Typography variant='heading-2'>Цветовые роли и размерность</Typography>
						<Typography tone='secondary'>Семантические токены и базовые размеры, на которых строится UI-kit.</Typography>
					</div>

					<div class={css.scaleGrid}>
						<div class={css.panel}>
							<Typography variant='heading-3'>Цвета</Typography>
							<div class={css.colorGrid}>
								<div class={css.swatch}>
									<div class={cn(css.swatchColor, css.primary)}/>
									<Typography weight='semibold'>Primary</Typography>
									<Typography tone='tertiary' variant='caption'>--color-primary</Typography>
								</div>
								<div class={css.swatch}>
									<div class={cn(css.swatchColor, css.success)}/>
									<Typography weight='semibold'>Success</Typography>
									<Typography tone='tertiary' variant='caption'>--color-success</Typography>
								</div>
								<div class={css.swatch}>
									<div class={cn(css.swatchColor, css.danger)}/>
									<Typography weight='semibold'>Danger</Typography>
									<Typography tone='tertiary' variant='caption'>--color-danger</Typography>
								</div>
							</div>
						</div>

						<div class={css.panel}>
							<Typography variant='heading-3'>Шкалы</Typography>
							<div class={css.scaleList}>
								<div class={css.scaleItem}>
									<Typography tone='tertiary' variant='caption'>Control heights</Typography>
									<Typography weight='semibold'>32 / 40 / 48 px</Typography>
								</div>
								<div class={css.scaleItem}>
									<Typography tone='tertiary' variant='caption'>Spacing</Typography>
									<Typography weight='semibold'>8 / 12 / 16 / 24 px</Typography>
								</div>
								<div class={css.scaleItem}>
									<Typography tone='tertiary' variant='caption'>Radius</Typography>
									<Typography weight='semibold'>6 / 8 / 12 / 16 px</Typography>
								</div>
							</div>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
