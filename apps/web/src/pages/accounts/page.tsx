import { PageFrame } from '@/shared/ui';

import { AccountsView } from '@/features/accounts';

import type { AppServices } from '@/app/app-services';

export function AccountsPage(props: Pick<AppServices, 'accountClient'>) {
	return (
		<PageFrame
			description='Счета семьи, валюты и текущие остатки.'
			eyebrow='Справочники'
			title='Счета'
		>
			<AccountsView client={props.accountClient}/>
		</PageFrame>
	);
}
