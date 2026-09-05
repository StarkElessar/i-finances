import { PageFrame } from '@/shared/ui';

import { ContactsView } from '@/features/contacts';

import type { AppServices } from '@/app/app-services';

export function ContactsPage(props: Pick<AppServices, 'contactClient'>) {
	return (
		<PageFrame
			description='Люди и компании, связанные с расходами и доходами семьи.'
			eyebrow='Справочники'
			title='Контакты'
		>
			<ContactsView client={props.contactClient}/>
		</PageFrame>
	);
}
