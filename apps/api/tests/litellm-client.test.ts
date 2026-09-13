import { createLiteLlmClient } from '@/modules/receipt-import/litellm-client';

import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE_OPTIONS = {
	apiKey: 'test-key',
	baseUrl: 'https://litellm.example.com/v1',
	model: 'deepseek-flash',
	timeoutMs: 5_000
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createLiteLlmClient', () => {
	it('sends the image alongside the prompt in one request and parses a fenced JSON response', async () => {
		const modelJson = {
			categorizedItems: [{ categoryId: 'category-food', confidence: 0.9, itemIndex: 0 }],
			rawOcrText: 'Продукты 12.50',
			receipt: {
				contactId: null,
				currency: 'BYN',
				happenedOn: '2026-08-08',
				items: [{
					discountMinor: 0,
					name: 'Продукты',
					quantity: 1,
					totalMinor: 1_250,
					unitPriceMinor: 1_250
				}],
				merchant: { address: null, displayName: 'Магазин', legalName: null, unp: null },
				totalAmountMinor: 1_250
			},
			warnings: []
		};

		const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
			expect(url).toBe('https://litellm.example.com/v1/chat/completions');
			const body = JSON.parse(init.body as string);

			expect(body.model).toBe('deepseek-flash');
			expect(body.messages[0].content[0].type).toBe('text');
			expect(body.messages[0].content[1].type).toBe('image_url');
			expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);

			return new Response(JSON.stringify({
				choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(modelJson)}\n\`\`\`` } }]
			}), { status: 200 });
		});

		vi.stubGlobal('fetch', fetchMock);

		const client = createLiteLlmClient(BASE_OPTIONS);
		const result = await client.processReceiptImage({
			categories: [{ description: '', id: 'category-food', keywords: [], name: 'Продукты' }],
			contacts: [],
			imageBytes: new Uint8Array([1, 2, 3]),
			imageContentType: 'image/jpeg',
			previousResult: null,
			reviewComment: '',
			startedAt: new Date('2026-08-08T10:00:00.000Z')
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.schemaVersion).toBe(1);
		expect(result.receipt.totalAmountMinor).toBe(1_250);
		expect(result.processor.pipelineVersion).toBe('receipt-litellm-v2');
		expect(result.processor.modelVersions).toEqual(['deepseek-flash']);
	});

	it('instructs the model to reconcile item totals with the receipt total', async () => {
		let promptText = '';

		vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string);

			promptText = body.messages[0].content[0].text as string;

			return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
		}));

		const client = createLiteLlmClient(BASE_OPTIONS);

		await expect(client.processReceiptImage({
			categories: [],
			contacts: [],
			imageBytes: new Uint8Array([1, 2, 3]),
			imageContentType: 'image/jpeg',
			previousResult: null,
			reviewComment: '',
			startedAt: new Date('2026-08-08T10:00:00.000Z')
		})).rejects.toThrow();

		expect(promptText).toContain('сумма всех receipt.items[].totalMinor');
		expect(promptText).toContain('равняться receipt.totalAmountMinor');
		expect(promptText).toContain('скорректируй totalMinor последней строки');
	});

	it('throws when the LiteLLM response is not ok', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })));

		const client = createLiteLlmClient(BASE_OPTIONS);

		await expect(client.processReceiptImage({
			categories: [],
			contacts: [],
			imageBytes: new Uint8Array([1]),
			imageContentType: 'image/jpeg',
			previousResult: null,
			reviewComment: '',
			startedAt: new Date('2026-08-08T10:00:00.000Z')
		})).rejects.toThrow();
	});
});
