import type { RouteDefinition } from '@solidjs/router';

import { getContacts } from '~/entities/contact';
import { ContactsPage } from '~/views/contacts/page';

export const route = {
    preload: () => getContacts({ status: 'all' })
} satisfies RouteDefinition;

export default function Contacts() {
    return <ContactsPage/>;
}
