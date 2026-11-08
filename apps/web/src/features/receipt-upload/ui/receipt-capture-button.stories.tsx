import { Fab } from '@/shared/ui/fab';
import { ToasterProvider } from '@/shared/ui/toast';

import type { ReceiptImportClient } from '@/features/receipt-import';

import { createMemoryHistory, MemoryRouter, Route } from '@solidjs/router';
import { Plus } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { ReceiptCaptureButton } from './receipt-capture-button';
import { ReceiptUploadProvider } from './receipt-upload-provider';

type Scenario = 'ready' | 'failures';

const NETWORK_DELAY_MS = 700;
const PROCESSING_DELAY_MS = 6_000;

function pause(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A server that takes a moment to accept a photo and a few seconds to read it; `failures` refuses every second photo. */
function createFakeClient(scenario: Scenario): ReceiptImportClient {
	const uploadedAt = new Map<string, number>();
	let counter = 0;

	return {
		async create(file: File) {
			await pause(NETWORK_DELAY_MS);
			counter += 1;

			if (scenario === 'failures' && counter % 2 === 0) {
				throw new TypeError('Failed to fetch');
			}

			const id = `receipt-${counter}`;

			uploadedAt.set(id, Date.now());

			return { ok: true as const, receiptImport: { id, status: 'queued' as const, name: file.name } };
		},
		async list() {
			return [...uploadedAt].map(([id, at]) => ({
				id,
				status: Date.now() - at > PROCESSING_DELAY_MS ? 'needs_review' as const : 'processing' as const
			}));
		}
	} as unknown as ReceiptImportClient;
}

function Preview(props: { scenario: Scenario }) {
	const history = createMemoryHistory();

	history.set({ value: '/', replace: true, scroll: false });

	return (
		<MemoryRouter
			history={history}
			root={(routeProps) => (
				<ToasterProvider>
					<ReceiptUploadProvider client={createFakeClient(props.scenario)}>
						<ReceiptCaptureButton/>
						<Fab aria-label='Новая операция'><Plus size={26}/></Fab>
						{routeProps.children}
					</ReceiptUploadProvider>
				</ToasterProvider>
			)}
		>
			<Route path='*' component={() => null}/>
		</MemoryRouter>
	);
}

// Phone only, like the button itself. Pick one or several photos: the toasts follow the mockup M-ReceiptCapture.
const meta = {
	title: 'Receipts/ReceiptCaptureButton',
	component: Preview,
	args: { scenario: 'ready' },
	globals: { viewport: { value: 'phone', isRotated: false } }
} satisfies Meta<typeof Preview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Photos are accepted, processed for six seconds, then «Чек готов к проверке». */
export const Ready: Story = {};

/** Every second photo is refused (no connection): the error toast stays next to the success one. */
export const SomeFailed: Story = { args: { scenario: 'failures' } };
