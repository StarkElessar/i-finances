import type {
	ReceiptCategorySnapshot,
	ReceiptContactSnapshot,
	ReceiptWorkerResult
} from '@i-finances/contracts';
import { receiptWorkerResultSchema } from '@i-finances/contracts';

// v1 split OCR and categorization across two model calls, back when the
// corporate proxy offered a vision-only model and a separate text/reasoning
// model. Only one model remains now and it handles both in a single vision
// call, so the pipeline shape itself changed, not just its configuration.
const PIPELINE_VERSION = 'receipt-litellm-v2';

export type LiteLlmClientOptions = {
	apiKey: string;
	baseUrl: string;
	model: string;
	timeoutMs: number;
};

export type ProcessReceiptImageInput = {
	categories: readonly ReceiptCategorySnapshot[];
	contacts: readonly ReceiptContactSnapshot[];
	imageBytes: Uint8Array;
	imageContentType: string;
	previousResult: ReceiptWorkerResult | null;
	reviewComment: string;
	startedAt: Date;
};

export type LiteLlmClient = {
	processReceiptImage: (input: ProcessReceiptImageInput) => Promise<ReceiptWorkerResult>;
};

type ChatCompletionResponse = {
	choices?: Array<{ message?: { content?: string } }>;
};

function extractJsonObject(text: string): unknown {
	const trimmed = text.trim();

	try {
		return JSON.parse(trimmed);
	}
	catch {
		const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);

		if (fenceMatch) {
			try {
				return JSON.parse(fenceMatch[1].trim());
			}
			catch {
				// The regex is non-greedy, so it can land on an unrelated fenced
				// block the model emitted before the real answer (e.g. a reasoning
				// model suggesting an OCR script). Fall through to brace extraction
				// over the full text instead of failing on that first block.
			}
		}

		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');

		if (start !== -1 && end > start) {
			return JSON.parse(trimmed.slice(start, end + 1));
		}

		throw new Error('Model output did not contain a JSON object.');
	}
}

function buildReceiptPrompt(input: ProcessReceiptImageInput): string {
	const revisionNote = input.reviewComment.trim().length > 0
		? `Пользователь уже отправлял этот чек на доработку с замечанием: "${input.reviewComment.trim()}". Обязательно учти его.`
		: 'Это первая попытка обработки данного чека.';
	const previousResultNote = input.previousResult !== null
		? `Прошлый (отклонённый) результат для сравнения:\n${JSON.stringify(input.previousResult)}`
		: '';

	return [
		'Ты обрабатываешь фотографию чека для семейного бюджетного приложения. Изображение приложено к этому сообщению.',
		revisionNote,
		previousResultNote,
		'',
		'Выполни за один проход: 1) прочитай всё видимое на фото и извлеки точный сырой текст чека; '
			+ '2) собери из него структурированный JSON; 3) распредели каждую товарную строку по одной из '
			+ 'переданных категорий; 4) попробуй сопоставить продавца чека с одним из переданных контактов.',
		'',
		'Доступные категории (используй только эти id, либо null для "Без категории"):',
		JSON.stringify(input.categories),
		'',
		'Доступные контакты (используй только эти id, либо null, если продавец не совпадает ни с одним):',
		JSON.stringify(input.contacts),
		'',
		'Верни ОДИН JSON-объект и больше ничего — без markdown-разметки, без пояснений до или после. Строго такой формы:',
		JSON.stringify({
			categorizedItems: [{ categoryId: 'id-категории-или-null', confidence: 0.9, itemIndex: 0 }],
			rawOcrText: 'полный сырой текст, распознанный на чеке',
			receipt: {
				contactId: 'id-контакта-или-null',
				currency: 'BYN',
				happenedOn: 'YYYY-MM-DD',
				items: [{
					discountMinor: 0,
					name: 'Название товара',
					quantity: 1,
					totalMinor: 100,
					unitPriceMinor: 100
				}],
				merchant: { address: null, displayName: 'Название магазина или null', legalName: null, unp: null },
				totalAmountMinor: 100
			},
			warnings: []
		}),
		'',
		'Правила: суммы — целые числа в копейках (47.90 BYN -> 4790); сумма всех receipt.items[].totalMinor '
			+ 'ОБЯЗАНА в точности равняться receipt.totalAmountMinor — если из-за скидок, весового товара или '
			+ 'округления числа не сходятся, скорректируй totalMinor последней строки так, чтобы равенство '
			+ 'выполнялось; ровно одна запись в categorizedItems на каждую строку receipt.items, itemIndex '
			+ 'ссылается на позицию в этом массиве; неизвестные поля — null, а не пропуск поля; не придумывай '
			+ 'данные, которых нет на фото.'
	].filter((line) => line.length > 0).join('\n');
}

async function postChatCompletion(
	options: LiteLlmClientOptions,
	body: Record<string, unknown>
): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

	try {
		const response = await fetch(`${options.baseUrl}/chat/completions`, {
			body: JSON.stringify(body),
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				'content-type': 'application/json'
			},
			method: 'POST',
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`LiteLLM request failed with status ${response.status}: ${await response.text()}`);
		}

		const payload = await response.json() as ChatCompletionResponse;
		const content = payload.choices?.[0]?.message?.content;

		if (typeof content !== 'string') {
			throw new Error('LiteLLM response did not contain message content.');
		}

		return content;
	}
	finally {
		clearTimeout(timeout);
	}
}

export function createLiteLlmClient(options: LiteLlmClientOptions): LiteLlmClient {
	const processReceiptImage = async (input: ProcessReceiptImageInput): Promise<ReceiptWorkerResult> => {
		const base64 = Buffer.from(input.imageBytes).toString('base64');
		const content = await postChatCompletion(options, {
			messages: [{
				content: [
					{ text: buildReceiptPrompt(input), type: 'text' },
					{ image_url: { url: `data:${input.imageContentType};base64,${base64}` }, type: 'image_url' }
				],
				role: 'user'
			}],
			model: options.model
		});
		const parsed = extractJsonObject(content) as Record<string, unknown>;

		return receiptWorkerResultSchema.parse({
			...parsed,
			processor: {
				finishedAt: new Date().toISOString(),
				modelVersions: [options.model],
				pipelineVersion: PIPELINE_VERSION,
				startedAt: input.startedAt.toISOString(),
				workerId: 'api-inprocess'
			},
			schemaVersion: 1
		});
	};

	return { processReceiptImage };
}
