import { PageFrame } from '@/shared/ui';

import { CategoriesView } from '@/features/categories';

import type { AppServices } from '@/app/app-services';

export function CategoriesPage(props: Pick<AppServices, 'categoryClient'>) {
	return (
		<PageFrame
			description='Настройте категории, ключевые слова и месячные бюджеты для операций семьи.'
			eyebrow='Справочники'
			title='Категории'
		>
			<CategoriesView client={props.categoryClient}/>
		</PageFrame>
	);
}
