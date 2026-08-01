import type { RouteDefinition } from '@solidjs/router';

import { getContacts } from '~/entities/contact';
import {
	formatLocalDateKey,
	getMonthlyExpenseSummary
} from '~/entities/operation';
import { ContactsPage } from '~/views/contacts/page';

export const route = {
	preload: () => Promise.all([
		getContacts({ status: 'all' }),
		getMonthlyExpenseSummary({
			month: formatLocalDateKey(new Date()).slice(0, 7)
		})
	])
} satisfies RouteDefinition;

export default function Contacts() {
	return <ContactsPage/>;
}
