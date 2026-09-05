import { PageFrame } from '@/shared/ui';

import { ReceiptsView } from '@/features/receipt-import';

import type { AppServices } from '@/app/app-services';

export function ReceiptsPage(props: Pick<AppServices, 'accountClient' | 'receiptImportClient'>) {
	return (
		<PageFrame
			description='Загрузите чек, проверьте распознанные данные и только потом создайте операции.'
			eyebrow='Импорт и проверка'
			title='Чеки'
		>
			<ReceiptsView accountClient={props.accountClient} client={props.receiptImportClient}/>
		</PageFrame>
	);
}
