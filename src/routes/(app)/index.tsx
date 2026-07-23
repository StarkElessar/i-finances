import type { RouteDefinition } from '@solidjs/router';

import { getAccounts } from '~/entities/account/api';
import { getCategories } from '~/entities/category';
import { HomePage } from '~/views/home/page';

export const route = {
    preload: () => Promise.all([
        getAccounts(),
        getCategories({ status: 'active' })
    ])
} satisfies RouteDefinition;

export default function Home() {
    return <HomePage/>;
}
