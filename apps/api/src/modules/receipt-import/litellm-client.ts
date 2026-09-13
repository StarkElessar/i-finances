import type {
	ReceiptCategorySnapshot,
	ReceiptContactSnapshot,
	ReceiptWorkerResult
} from '@i-finances/contracts';
import { receiptWorkerResultSchema } from '@i-finances/contracts';

const PIPELINE_VERSION = 'receipt-litellm-v1';

export type LiteLlmClientOptions = {
	apiKey: string;
	baseUrl: string;
	categorizationModel: string;
	ocrModel: string;
	timeoutMs: number;
};

export type CategorizeReceiptInput = {
	categories: readonly ReceiptCategorySnapshot[];
	contacts: readonly ReceiptContactSnapshot[];
	ocrText: string;
	previousResult: ReceiptWorkerResult | null;
	reviewComment: string;
	startedAt: Date;
};

export type LiteLlmClient = {
	categorizeReceipt: (input: CategorizeReceiptInput) => Promise<ReceiptWorkerResult>;
	extractReceiptText: (imageBytes: Uint8Array, imageContentType: string) => Promise<string>;
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
			return JSON.parse(fenceMatch[1].trim());
		}

		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');

		if (start !== -1 && end > start) {
			return JSON.parse(trimmed.slice(start, end + 1));
		}

		throw new Error('Model output did not contain a JSON object.');
	}
}

function buildCategorizationPrompt(input: CategorizeReceiptInput): string {
	const revisionNote = input.reviewComment.trim().length > 0
		? `Пользователь уже отправлял этот чек на доработку с замечанием: "${input.reviewComment.trim()}". Обязательно учти его.`
		: 'Это первая попытка обработки данного чека.';
	const previousResultNote = input.previousResult !== null
		? `Прошлый (отклонённый) результат для сравнения:\n${JSON.stringify(input.previousResult)}`
		: '';

	return [
		'Ты получаешь сырой OCR-текст фотографии чека для семейного бюджетного приложения.',
		`Текст чека:\n${input.ocrText}`,
		revisionNote,
		previousResultNote,
		'',
		'Собери структурированный JSON чека и распредели каждую товарную строку по одной из переданных категорий. '
			+ 'Также попробуй сопоставить продавца чека с одним из переданных контактов.',
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
			rawOcrText: input.ocrText,
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
			+ 'данные, которых нет в тексте.'
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
	const extractReceiptText = async (imageBytes: Uint8Array, imageContentType: string): Promise<string> => {
		const base64 = Buffer.from(imageBytes).toString('base64');
		const content = await postChatCompletion(options, {
			messages: [{
				content: [
					{
						text: 'Прочитай изображение чека. Верни только plain-text транскрипцию всего видимого текста '
							+ 'в естественном порядке чтения, построчно. Не добавляй комментариев, не переводи, не '
							+ 'придумывай текст, которого нет.',
						type: 'text'
					},
					{ image_url: { url: `data:${imageContentType};base64,${base64}` }, type: 'image_url' }
				],
				role: 'user'
			}],
			model: options.ocrModel
		});

		return content.trim();
	};

	const categorizeReceipt = async (input: CategorizeReceiptInput): Promise<ReceiptWorkerResult> => {
		const content = await postChatCompletion(options, {
			messages: [{ content: buildCategorizationPrompt(input), role: 'user' }],
			model: options.categorizationModel
		});
		const parsed = extractJsonObject(content) as Record<string, unknown>;

		return receiptWorkerResultSchema.parse({
			...parsed,
			processor: {
				finishedAt: new Date().toISOString(),
				modelVersions: [options.ocrModel, options.categorizationModel],
				pipelineVersion: PIPELINE_VERSION,
				startedAt: input.startedAt.toISOString(),
				workerId: 'api-inprocess'
			},
			schemaVersion: 1
		});
	};

	return { categorizeReceipt, extractReceiptText };
}
