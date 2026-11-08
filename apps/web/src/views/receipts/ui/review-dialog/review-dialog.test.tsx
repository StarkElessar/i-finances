// @vitest-environment jsdom
import type { PersistedAccount } from '@/entities/account';
import type { ReceiptImport } from '@/entities/receipt-import';

import { MemoryRouter } from '@solidjs/router';
import { fireEvent, screen } from '@testing-library/dom';
import { createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { describe, expect, it } from 'vitest';

import { renderUi } from '../../../../../tests/render-ui';

import { ReviewDialog } from './review-dialog';

const CONTACT_LABEL = 'Продавец / контакт';
const ACCOUNT_LABEL = 'Счёт списания';

function createReceiptImport(overrides: Partial<ReceiptImport> = {}): ReceiptImport {
	return {
		accountId: null,
		approvedAt: null,
		categories: [
			{ description: '', id: 'cat-food', keywords: [], name: 'Продукты' },
			{ description: '', id: 'cat-home', keywords: [], name: 'Дом' }
		],
		categoriesSnapshotVersion: 'v1',
		contacts: [
			{ id: 'contact-1', name: 'Алми' },
			{ id: 'contact-2', name: 'Евроопт' }
		],
		createdAt: '2026-11-08T10:00:00.000Z',
		id: 'receipt-1',
		imageContentType: 'image/jpeg',
		imageDeletedAt: null,
		imageOriginalName: 'check.jpg',
		imageSizeBytes: 1_024,
		imageUrl: null,
		latestJob: {
			attempt: 1,
			completedAt: '2026-11-08T10:00:20.000Z',
			createdAt: '2026-11-08T10:00:00.000Z',
			id: 'job-1',
			lastError: null,
			status: 'completed',
			updatedAt: '2026-11-08T10:00:20.000Z'
		},
		operationIds: [],
		result: {
			categorizedItems: [{ categoryId: 'cat-food', confidence: 0.9, itemIndex: 0 }],
			processor: {
				finishedAt: '2026-11-08T10:00:20.000Z',
				modelVersions: [],
				pipelineVersion: '2',
				startedAt: '2026-11-08T10:00:01.000Z',
				workerId: 'worker-1'
			},
			rawOcrText: '',
			receipt: {
				contactId: null,
				currency: 'BYN',
				happenedOn: '2026-11-08',
				items: [{ discountMinor: 0, name: 'Хлеб', quantity: 1, totalMinor: 250, unitPriceMinor: 250 }],
				merchant: { address: null, displayName: 'Евроопт', legalName: null, unp: null },
				totalAmountMinor: 250
			},
			schemaVersion: 1,
			warnings: []
		},
		reviewComment: '',
		status: 'needs_review',
		updatedAt: '2026-11-08T10:00:20.000Z',
		version: 3,
		...overrides
	};
}

function createAccount(id: string, name: string): PersistedAccount {
	return {
		archivedAt: null,
		color: '#000000',
		createdAt: '2026-10-01T00:00:00.000Z',
		currency: 'BYN',
		description: '',
		details: {},
		hasOperations: false,
		id,
		initialBalanceMinor: 0,
		isColorAccentEnabled: false,
		isIncludedInFamilyTotal: true,
		name,
		owner: '',
		type: 'cash',
		updatedAt: '2026-10-01T00:00:00.000Z',
		version: 1
	};
}

function getSelect(label: string): HTMLSelectElement {
	return screen.getByLabelText(label);
}

function choose(select: HTMLSelectElement, value: string): void {
	select.value = value;
	fireEvent.change(select);
}

/**
 * Mounts the dialog the way the receipts page feeds it: receipts and accounts live in stores that
 * are reconciled by `id` on every poll, and the open receipt is read straight out of the store.
 */
function mountDialog(initial: ReceiptImport) {
	const [receipts, setReceipts] = createStore<ReceiptImport[]>([initial]);
	const [accounts, setAccounts] = createStore<PersistedAccount[]>([
		createAccount('account-1', 'Карта'),
		createAccount('account-2', 'Наличные')
	]);
	const [open, setOpen] = createSignal(true);
	const [selectedId, setSelectedId] = createSignal(initial.id);

	renderUi(() => (
		<MemoryRouter
			root={() => (
				<ReviewDialog
					accounts={accounts}
					open={open()}
					receiptImport={receipts.find((item) => item.id === selectedId())}
					onOpenChange={setOpen}
					onUpdated={() => Promise.resolve()}
					onViewImage={() => undefined}
				/>
			)}
		/>
	));

	return {
		open,
		poll: (next: ReceiptImport[]) => setReceipts(reconcile(structuredClone(next), { key: 'id' })),
		pollAccounts: (next: PersistedAccount[]) => setAccounts(reconcile(structuredClone(next), { key: 'id' })),
		select: setSelectedId,
		setOpen
	};
}

describe('ReviewDialog', () => {
	it('keeps the contact, account, comment and category the user picked when a poll delivers a fresh snapshot', () => {
		const dialog = mountDialog(createReceiptImport());

		choose(getSelect(CONTACT_LABEL), 'contact-2');
		choose(getSelect(ACCOUNT_LABEL), 'account-2');
		fireEvent.input(screen.getByPlaceholderText(/неверно распознана/), { target: { value: 'проверить дату' } });
		choose(screen.getAllByRole('combobox')[0] as HTMLSelectElement, 'cat-home');

		const contactSelect = getSelect(CONTACT_LABEL);
		const optionsBefore = [...contactSelect.options];

		// A poll: the server answers with a brand-new JSON copy that differs only in bookkeeping fields.
		dialog.poll([
			createReceiptImport({
				latestJob: { ...createReceiptImport().latestJob, updatedAt: '2026-11-08T10:00:25.000Z' },
				updatedAt: '2026-11-08T10:00:25.000Z'
			})
		]);
		dialog.pollAccounts([createAccount('account-1', 'Карта'), createAccount('account-2', 'Наличные')]);

		expect(getSelect(CONTACT_LABEL).value).toBe('contact-2');
		expect(getSelect(ACCOUNT_LABEL).value).toBe('account-2');
		expect(screen.getByPlaceholderText<HTMLTextAreaElement>(/неверно распознана/).value).toBe('проверить дату');
		expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('cat-home');
		// The <option> nodes are the very same elements, so an open native picker is not torn down.
		expect([...getSelect(CONTACT_LABEL).options]).toEqual(optionsBefore);
		expect(getSelect(CONTACT_LABEL).options[1]).toBe(optionsBefore[1]);
	});

	it('fills the account default once the accounts arrive after the dialog opened, and only while none is picked', () => {
		const dialog = mountDialog(createReceiptImport());

		expect(getSelect(ACCOUNT_LABEL).value).toBe('account-1');

		choose(getSelect(ACCOUNT_LABEL), 'account-2');
		dialog.pollAccounts([
			createAccount('account-1', 'Карта'),
			createAccount('account-2', 'Наличные'),
			createAccount('account-3', 'Копилка')
		]);

		expect(getSelect(ACCOUNT_LABEL).value).toBe('account-2');
	});

	it('rebuilds the draft when the receipt moves to another status', () => {
		const dialog = mountDialog(createReceiptImport({ result: null, status: 'processing' }));

		expect(screen.queryByLabelText(CONTACT_LABEL)).not.toBeInTheDocument();

		dialog.poll([createReceiptImport({ status: 'needs_review', version: 4 })]);

		expect(getSelect(CONTACT_LABEL).value).toBe('');
		choose(getSelect(CONTACT_LABEL), 'contact-1');
		expect(getSelect(CONTACT_LABEL).value).toBe('contact-1');
	});

	it('starts from the server values again when the dialog is reopened or another receipt is opened', () => {
		const dialog = mountDialog(createReceiptImport());

		dialog.poll([
			createReceiptImport(),
			createReceiptImport({ id: 'receipt-2', version: 1 })
		]);
		choose(getSelect(CONTACT_LABEL), 'contact-2');
		dialog.select('receipt-2');

		expect(getSelect(CONTACT_LABEL).value).toBe('');

		choose(getSelect(CONTACT_LABEL), 'contact-1');
		dialog.setOpen(false);
		dialog.setOpen(true);

		expect(getSelect(CONTACT_LABEL).value).toBe('');
	});
});
