import { getAccounts } from '~/entities/account/api';
import { getCategories } from '~/entities/category';
import { getContacts } from '~/entities/contact';
import { getAccountBalances } from '~/entities/operation';

import { HomePage } from '~/views/home/page';

import type { RouteDefinition } from '@solidjs/router';

export const route = {
	preload: () => Promise.all([
		getAccounts(),
		getAccountBalances(),
		getCategories({ status: 'active' }),
		getContacts({ status: 'all' })
	])
} satisfies RouteDefinition;

export default function Home() {
	return <HomePage/>;
}
