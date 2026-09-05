import { PageFrame } from '@/shared/ui';

import { AccountsView } from '@/features/accounts';
import { OperationsView } from '@/features/operations';

import type { AppServices } from '@/app/app-services';

export function HomePage(props: Pick<AppServices, 'accountClient' | 'categoryClient' | 'contactClient' | 'operationClient'>) {
	return (
		<PageFrame
			description='Счета, остатки и последние операции семьи в одном рабочем пространстве.'
			eyebrow='Обзор'
			title='Семейные финансы'
		>
			<AccountsView client={props.accountClient}/>
			<OperationsView
				categoryClient={props.categoryClient}
				client={props.operationClient}
				contactClient={props.contactClient}
			/>
		</PageFrame>
	);
}
