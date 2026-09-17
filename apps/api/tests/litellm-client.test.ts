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

	it('recovers a JSON object that follows an unrelated fenced code block', async () => {
		// Reasoning models occasionally preface their answer with an unrelated
		// snippet (e.g. suggesting an OCR script) before the actual JSON answer.
		// Reproduces the "Unexpected token 'b', \"bash pip i\"..." failure seen in
		// production: operation 103204BF-3683-4E5D-B511-E31328792FE7.
		const modelJson = {
			categorizedItems: [{ categoryId: null, confidence: 0.5, itemIndex: 0 }],
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
		const content = '```bash\npip install pytesseract\n```\n'
			+ `Вот результат:\n\`\`\`json\n${JSON.stringify(modelJson)}\n\`\`\``;

		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			choices: [{ message: { content } }]
		}), { status: 200 })));

		const client = createLiteLlmClient(BASE_OPTIONS);
		const result = await client.processReceiptImage({
			categories: [],
			contacts: [],
			imageBytes: new Uint8Array([1, 2, 3]),
			imageContentType: 'image/jpeg',
			previousResult: null,
			reviewComment: '',
			startedAt: new Date('2026-08-08T10:00:00.000Z')
		});

		expect(result.receipt.totalAmountMinor).toBe(1_250);
	});

	it('requests JSON-mode output from the model', async () => {
		let requestedResponseFormat: unknown;

		vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string);

			requestedResponseFormat = body.response_format;

			return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
		}));

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

		expect(requestedResponseFormat).toEqual({ type: 'json_object' });
	});

	it('retries with a fresh request when the model answers with no JSON at all, and keeps the retried result', async () => {
		const modelJson = {
			categorizedItems: [{ categoryId: null, confidence: null, itemIndex: 0 }],
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

		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				choices: [{ message: { content: 'Извините, не могу разобрать это изображение.' } }]
			}), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				choices: [{ message: { content: JSON.stringify(modelJson) } }]
			}), { status: 200 }));

		vi.stubGlobal('fetch', fetchMock);

		const client = createLiteLlmClient(BASE_OPTIONS);
		const result = await client.processReceiptImage({
			categories: [],
			contacts: [],
			imageBytes: new Uint8Array([1, 2, 3]),
			imageContentType: 'image/jpeg',
			previousResult: null,
			reviewComment: '',
			startedAt: new Date('2026-08-08T10:00:00.000Z')
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.receipt.totalAmountMinor).toBe(1_250);
	});

	it('fails with the raw model output attached once every retry still has no JSON', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			choices: [{ message: { content: 'Извините, не могу разобрать это изображение.' } }]
		}), { status: 200 })));

		const client = createLiteLlmClient(BASE_OPTIONS);

		await expect(client.processReceiptImage({
			categories: [],
			contacts: [],
			imageBytes: new Uint8Array([1]),
			imageContentType: 'image/jpeg',
			previousResult: null,
			reviewComment: '',
			startedAt: new Date('2026-08-08T10:00:00.000Z')
		})).rejects.toThrow(/Извините, не могу разобрать/);
	});

	it('retries with a fresh request when the proxy rejects the request outright, and keeps the retried result', async () => {
		// Reproduces production operation 561b96c1-ceee-4d10-a13c-c2e5477a8b51: the same
		// request, resubmitted unchanged, succeeded on the very next attempt — this is the
		// corporate LiteLLM proxy's response_format validation being flaky, not a real problem
		// with our prompt (the request replayed outside the app used the exact same prompt text).
		const modelJson = {
			categorizedItems: [{ categoryId: null, confidence: null, itemIndex: 0 }],
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

		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				error: {
					message: "litellm.BadRequestError: Prompt must contain the word 'json' "
						+ "in some form to use 'response_format' of type 'json_object'."
				}
			}), { status: 400 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				choices: [{ message: { content: JSON.stringify(modelJson) } }]
			}), { status: 200 }));

		vi.stubGlobal('fetch', fetchMock);

		const client = createLiteLlmClient(BASE_OPTIONS);
		const result = await client.processReceiptImage({
			categories: [],
			contacts: [],
			imageBytes: new Uint8Array([1, 2, 3]),
			imageContentType: 'image/jpeg',
			previousResult: null,
			reviewComment: '',
			startedAt: new Date('2026-08-08T10:00:00.000Z')
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.receipt.totalAmountMinor).toBe(1_250);
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
