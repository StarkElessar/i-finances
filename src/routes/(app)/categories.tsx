import { getCategories } from '~/entities/category';
import {
	formatLocalDateKey,
	getMonthlyExpenseSummary
} from '~/entities/operation';

import { CategoriesPage } from '~/views/categories/page';

import type { RouteDefinition } from '@solidjs/router';

export const route = {
	preload: () => Promise.all([
		getCategories({ status: 'all' }),
		getMonthlyExpenseSummary({
			month: formatLocalDateKey(new Date()).slice(0, 7)
		})
	])
} satisfies RouteDefinition;

export default function Categories() {
	return <CategoriesPage/>;
}
