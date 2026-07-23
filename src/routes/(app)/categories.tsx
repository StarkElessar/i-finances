import type { RouteDefinition } from '@solidjs/router';

import { getCategories } from '~/entities/category';
import { CategoriesPage } from '~/views/categories/page';

export const route = {
    preload: () => getCategories({ status: 'all' })
} satisfies RouteDefinition;

export default function Categories() {
    return <CategoriesPage/>;
}
