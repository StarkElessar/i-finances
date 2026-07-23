import type { RouteDefinition } from '@solidjs/router';

import { getAccounts } from '~/entities/account/api';
import { getCategories } from '~/entities/category';
import { getContacts } from '~/entities/contact';
import { HomePage } from '~/views/home/page';

export const route = {
    preload: () => Promise.all([
        getAccounts(),
        getCategories({ status: 'active' }),
        getContacts({ status: 'all' })
    ])
} satisfies RouteDefinition;

export default function Home() {
    return <HomePage/>;
}
