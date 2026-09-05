import './styles/global.scss';

import { AccountClient } from '@/features/accounts';
import { AuthClient } from '@/features/auth';
import { CategoryClient } from '@/features/categories';
import { ContactClient } from '@/features/contacts';
import { OperationClient } from '@/features/operations';
import { ReceiptImportClient } from '@/features/receipt-import';

import { App } from '@/app';

import { render } from 'solid-js/web';

const root = document.querySelector('#root');

if (root === null) {
	throw new Error('Web application root element was not found.');
}

render(
	() => (
		<App
			accountClient={new AccountClient()}
			authClient={new AuthClient()}
			categoryClient={new CategoryClient()}
			contactClient={new ContactClient()}
			operationClient={new OperationClient()}
			receiptImportClient={new ReceiptImportClient()}
		/>
	),
	root
);
