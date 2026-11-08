// @vitest-environment jsdom
import { ToasterProvider } from '@/shared/ui/toast';

import type { ReceiptImportClient } from '@/features/receipt-import';

import { createMemoryHistory, MemoryRouter, Route } from '@solidjs/router';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '../../../../tests/render-ui';

import { ReceiptCaptureButton } from './receipt-capture-button';
import { ReceiptUploadProvider } from './receipt-upload-provider';

type FakeClient = Pick<ReceiptImportClient, 'create' | 'list'>;

function photo(name: string, type = 'image/jpeg'): File {
	return new File([new Uint8Array(10)], name, { type });
}

function mount(client: FakeClient) {
	const history = createMemoryHistory();

	history.set({ value: '/', replace: true, scroll: false });
	renderUi(() => (
		<MemoryRouter
			history={history}
			root={(props) => (
				<ToasterProvider>
					<ReceiptUploadProvider client={client as ReceiptImportClient}>
						<ReceiptCaptureButton/>
						{props.children}
					</ReceiptUploadProvider>
				</ToasterProvider>
			)}
		>
			<Route path='*' component={() => null}/>
		</MemoryRouter>
	));

	return history;
}

async function createdReceipt(file: File) {
	return { ok: true as const, receiptImport: { id: `id-${file.name}`, status: 'queued' as const } };
}

function chooseFiles(files: File[]): void {
	const input = document.querySelector<HTMLInputElement>('input[type="file"]');

	if (!input) {
		throw new Error('No file input');
	}

	Object.defineProperty(input, 'files', { configurable: true, value: files });
	fireEvent.change(input);
}

beforeEach(() => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('ReceiptCaptureButton', () => {
	it('opens the phone file sheet from one named button, with several photos allowed and no forced camera', () => {
		mount({ create: vi.fn(), list: vi.fn() });

		const input = document.querySelector<HTMLInputElement>('input[type="file"]');
		const click = vi.spyOn(input as HTMLInputElement, 'click');

		fireEvent.click(screen.getByRole('button', { name: 'Добавить из чека' }));

		expect(click).toHaveBeenCalledOnce();
		expect(input).toHaveAttribute('multiple');
		expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/heic,image/heif');
		expect(input).not.toHaveAttribute('capture');
	});

	it('uploads the chosen photos at once, tells the result and offers a way to the receipts page', async () => {
		const client: FakeClient = {
			create: vi.fn(createdReceipt),
			list: vi.fn(async () => [])
		};
		const history = mount(client);

		chooseFiles([photo('a'), photo('b')]);

		await waitFor(() => expect(screen.getByText('Загружено: 2, обрабатываются')).toBeInTheDocument());
		expect(client.create).toHaveBeenCalledTimes(2);
		expect(screen.queryByText(/Загружаем чек/)).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'К чекам' }));
		await waitFor(() => expect(history.get()).toBe('/receipts'));
	});

	it('names a photo that did not go through and still uploads the rest', async () => {
		const client: FakeClient = {
			create: vi.fn(createdReceipt),
			list: vi.fn(async () => [])
		};

		mount(client);
		chooseFiles([photo('a'), photo('b.gif', 'image/gif'), photo('c')]);

		await waitFor(() => expect(screen.getByText('Загружено: 2, обрабатываются')).toBeInTheDocument());
		expect(screen.getByRole('alert')).toHaveTextContent('Не загрузилось 1 из 3: нужны JPEG, PNG или HEIC');
		expect(client.create).toHaveBeenCalledTimes(2);
	});

	it('says the receipt is ready when processing ends, on whatever page the person is on', async () => {
		vi.useFakeTimers();

		const client: FakeClient = {
			create: vi.fn(async () => ({ ok: true as const, receiptImport: { id: 'r1', status: 'queued' as const } })),
			list: vi.fn()
				.mockResolvedValueOnce([{ id: 'r1', status: 'processing' }])
				.mockResolvedValue([{ id: 'r1', status: 'needs_review' }]) as FakeClient['list']
		};

		mount(client);
		chooseFiles([photo('a')]);

		await vi.advanceTimersByTimeAsync(0);
		expect(screen.getByText('Чек загружен, обрабатывается')).toBeInTheDocument();

		await vi.advanceTimersByTimeAsync(5_000);
		expect(screen.getByText('Чек готов к проверке')).toBeInTheDocument();
		expect(screen.queryByText('Чек загружен, обрабатывается')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Проверить' })).toBeInTheDocument();
		vi.useRealTimers();
	});
});
