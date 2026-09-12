import { createLiteLlmClient } from '@/modules/receipt-import/litellm-client';

import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE_OPTIONS = {
	apiKey: 'test-key',
	baseUrl: 'https://litellm.example.com/v1',
	categorizationModel: 'deepseek-v4-flash',
	ocrModel: 'deepseek-v4-flash-vision-exp',
	timeoutMs: 5_000
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createLiteLlmClient', () => {
	it('sends the image as an OpenAI-style image_url content block and returns the model text', async () => {
		const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
			expect(url).toBe('https://litellm.example.com/v1/chat/completions');
			const body = JSON.parse(init.body as string);

			expect(body.model).toBe('deepseek-v4-flash-vision-exp');
			expect(body.messages[0].content[1].type).toBe('image_url');
			expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);

			return new Response(JSON.stringify({
				choices: [{ message: { content: 'ИТОГО 62.47' } }]
			}), { status: 200 });
		});

		vi.stubGlobal('fetch', fetchMock);

		const client = createLiteLlmClient(BASE_OPTIONS);
		const text = await client.extractReceiptText(new Uint8Array([1, 2, 3]), 'image/jpeg');

		expect(text).toBe('ИТОГО 62.47');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('parses a fenced JSON response from the categorization model into a valid ReceiptWorkerResult', async () => {
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

		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(modelJson)}\n\`\`\`` } }]
		}), { status: 200 })));

		const client = createLiteLlmClient(BASE_OPTIONS);
		const result = await client.categorizeReceipt({
			categories: [{ description: '', id: 'category-food', keywords: [], name: 'Продукты' }],
			contacts: [],
			ocrText: 'Продукты 12.50',
			previousResult: null,
			reviewComment: '',
			startedAt: new Date('2026-08-08T10:00:00.000Z')
		});

		expect(result.schemaVersion).toBe(1);
		expect(result.receipt.totalAmountMinor).toBe(1_250);
		expect(result.processor.pipelineVersion).toBe('receipt-litellm-v1');
	});

	it('throws when the LiteLLM response is not ok', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })));

		const client = createLiteLlmClient(BASE_OPTIONS);

		await expect(client.extractReceiptText(new Uint8Array([1]), 'image/jpeg')).rejects.toThrow();
	});
});
