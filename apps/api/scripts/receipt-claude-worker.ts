import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type {
    LeasedReceiptProcessingJob,
    ReceiptWorkerResult
} from '@i-finances/contracts';
import { receiptWorkerResultSchema } from '@i-finances/contracts';

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_IMAGE_DIRECTORY = resolve(
    PROJECT_ROOT,
    'data',
    'receipt-worker-tmp'
);

const API_KEY = requireEnv('RECEIPT_WORKER_API_KEY');
const BASE_URL = (
    process.env.RECEIPT_WORKER_BASE_URL
    ?? process.env.AUTH_ORIGIN
    ?? 'http://localhost:5173'
).replace(/\/$/u, '');
const WORKER_ID = process.env.RECEIPT_WORKER_ID ?? 'claude-pro-worker';
const PIPELINE_VERSION = 'receipt-claude-cli-v1';
const CLAUDE_MODEL = process.env.RECEIPT_WORKER_CLAUDE_MODEL;
const POLL_INTERVAL_MS = Number(
    process.env.RECEIPT_WORKER_POLL_INTERVAL_MS ?? 30_000
);
const HEARTBEAT_INTERVAL_MS = Number(
    process.env.RECEIPT_WORKER_HEARTBEAT_INTERVAL_MS ?? 3 * 60 * 1_000
);
const CLAUDE_TIMEOUT_MS = Number(
    process.env.RECEIPT_WORKER_CLAUDE_TIMEOUT_MS ?? 4 * 60 * 1_000
);

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
    'image/heic': '.heic',
    'image/jpeg': '.jpg',
    'image/png': '.png'
};

type ModelReceiptOutput = {
    categorizedItems: ReceiptWorkerResult['categorizedItems'];
    rawOcrText: string;
    receipt: ReceiptWorkerResult['receipt'];
    warnings?: string[];
};

let shuttingDown = false;

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Environment variable ${name} is required.`);
    }

    return value;
}

function log(message: string): void {
    console.warn(`[${new Date().toISOString()}] ${message}`);
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolvePromise) => {
        setTimeout(resolvePromise, milliseconds);
    });
}

function withJitter(baseMilliseconds: number): number {
    const jitter = baseMilliseconds * 0.2 * (Math.random() - 0.5);

    return Math.max(1_000, Math.round(baseMilliseconds + jitter));
}

async function apiRequest(
    path: string,
    init: RequestInit & { leaseToken?: string } = {}
): Promise<Response> {
    const headers = new Headers(init.headers);

    headers.set('authorization', `Bearer ${API_KEY}`);

    if (init.leaseToken !== undefined) {
        headers.set('x-receipt-lease-token', init.leaseToken);
    }

    if (init.body !== undefined && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
    }

    return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

async function leaseNextJob(): Promise<LeasedReceiptProcessingJob | undefined> {
    const response = await apiRequest('/api/receipt-worker/jobs/lease', {
        body: JSON.stringify({ workerId: WORKER_ID }),
        method: 'POST'
    });

    if (response.status === 204) {
        return undefined;
    }

    if (!response.ok) {
        throw new Error(`Lease request failed with status ${response.status}.`);
    }

    return response.json() as Promise<LeasedReceiptProcessingJob>;
}

async function downloadImage(
    job: LeasedReceiptProcessingJob
): Promise<{ bytes: Uint8Array; contentType: string }> {
    const response = await apiRequest(job.imageUrl, {
        leaseToken: job.leaseToken,
        method: 'GET'
    });

    if (!response.ok) {
        throw new Error(`Image download failed with status ${response.status}.`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const expectedSha256 = response.headers.get('content-sha256');
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');

    if (expectedSha256 !== null && expectedSha256 !== actualSha256) {
        throw new Error('Downloaded image failed the SHA-256 integrity check.');
    }

    return {
        bytes,
        contentType: response.headers.get('content-type') ?? 'image/jpeg'
    };
}

function startHeartbeat(job: LeasedReceiptProcessingJob): () => void {
    const timer = setInterval(() => {
        apiRequest(
            `/api/receipt-worker/jobs/${job.processingJobId}/heartbeat`,
            {
                body: JSON.stringify({ leaseToken: job.leaseToken }),
                method: 'POST'
            }
        ).catch((error: unknown) => {
            log(`Heartbeat failed for job ${job.processingJobId}: ${
                error instanceof Error ? error.message : String(error)
            }`);
        });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
        clearInterval(timer);
    };
}

async function completeJob(
    job: LeasedReceiptProcessingJob,
    result: ReceiptWorkerResult
): Promise<void> {
    const response = await apiRequest(
        `/api/receipt-worker/jobs/${job.processingJobId}/complete`,
        {
            body: JSON.stringify({ leaseToken: job.leaseToken, result }),
            method: 'POST'
        }
    );

    if (!response.ok) {
        throw new Error(`Complete request failed with status ${response.status}.`);
    }
}

async function failJob(
    job: LeasedReceiptProcessingJob,
    error: string
): Promise<void> {
    const response = await apiRequest(
        `/api/receipt-worker/jobs/${job.processingJobId}/fail`,
        {
            body: JSON.stringify({ error: error.slice(0, 2_000), leaseToken: job.leaseToken }),
            method: 'POST'
        }
    );

    if (!response.ok) {
        log(`Fail request itself failed with status ${response.status}.`);
    }
}

function buildPrompt(
    job: LeasedReceiptProcessingJob,
    imagePath: string
): string {
    const revisionNote = job.reviewComment.trim().length > 0
        ? `Пользователь уже отправлял этот чек на доработку с замечанием: `
            + `"${job.reviewComment.trim()}". Обязательно учти его.`
        : 'Это первая попытка обработки данного чека.';
    const previousResultNote = job.previousResult !== null
        ? `Прошлый (отклонённый) результат для сравнения:\n`
            + `${JSON.stringify(job.previousResult)}`
        : '';

    return [
        'Ты обрабатываешь фотографию чека для семейного бюджетного приложения.',
        `Прочитай изображение по пути ${imagePath} инструментом Read.`,
        revisionNote,
        previousResultNote,
        '',
        'Выполни за один проход: 1) OCR — извлеки максимально точный сырой '
            + 'текст чека; 2) собери структурированный JSON чека; 3) распредели '
            + 'каждую товарную строку по одной из переданных категорий.',
        '',
        'Доступные категории (используй только эти id, либо null для '
            + '"Без категории"):',
        JSON.stringify(job.categories),
        '',
        'Верни ОДИН JSON-объект и больше ничего — без markdown-разметки, без '
            + 'пояснений до или после. Строго такой формы:',
        JSON.stringify({
            categorizedItems: [
                { categoryId: 'id-категории-или-null', confidence: 0.9, itemIndex: 0 }
            ],
            rawOcrText: 'полный сырой текст, распознанный на чеке',
            receipt: {
                currency: 'BYN',
                happenedOn: 'YYYY-MM-DD',
                items: [
                    {
                        discountMinor: 0,
                        name: 'Название товара',
                        quantity: 1,
                        totalMinor: 100,
                        unitPriceMinor: 100
                    }
                ],
                merchant: {
                    address: null,
                    displayName: 'Название магазина или null',
                    legalName: null,
                    unp: null
                },
                totalAmountMinor: 100
            },
            warnings: []
        }),
        '',
        'Правила: суммы — целые числа в копейках (47.90 BYN -> 4790); ровно '
            + 'одна запись в categorizedItems на каждую строку receipt.items, '
            + 'itemIndex ссылается на позицию в этом массиве; неизвестные поля '
            + '— null, а не пропуск поля; не придумывай данные, которых нет на '
            + 'фото.'
    ].filter((line) => line.length > 0).join('\n');
}

async function runClaude(prompt: string): Promise<string> {
    const arguments_ = [
        '-p', prompt,
        '--output-format', 'json',
        '--allowedTools', 'Read',
        '--permission-prompts', 'none'
    ];

    if (CLAUDE_MODEL !== undefined) {
        arguments_.push('--model', CLAUDE_MODEL);
    }

    const { stdout } = await execFileAsync('claude', arguments_, {
        cwd: PROJECT_ROOT,
        maxBuffer: 20 * 1024 * 1024,
        timeout: CLAUDE_TIMEOUT_MS
    });

    const envelope = JSON.parse(stdout) as {
        result?: string;
        subtype?: string;
    };

    if (envelope.subtype !== 'success' || typeof envelope.result !== 'string') {
        throw new Error(
            `Claude CLI did not return a successful result (subtype: ${
                envelope.subtype ?? 'unknown'
            }).`
        );
    }

    return envelope.result;
}

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

async function processJob(job: LeasedReceiptProcessingJob): Promise<void> {
    log(`Leased job ${job.processingJobId} (attempt ${job.attempt}).`);

    let imagePath: string | undefined;
    let stopHeartbeat: (() => void) | undefined;

    try {
        const image = await downloadImage(job);
        const extension = EXTENSION_BY_CONTENT_TYPE[image.contentType] ?? '.jpg';

        await mkdir(TEMP_IMAGE_DIRECTORY, { recursive: true });
        imagePath = resolve(
            TEMP_IMAGE_DIRECTORY,
            `${job.processingJobId}${extension}`
        );
        await writeFile(imagePath, image.bytes);

        stopHeartbeat = startHeartbeat(job);

        const startedAt = new Date();
        const rawResponse = await runClaude(buildPrompt(job, imagePath));
        const finishedAt = new Date();
        const modelOutput = extractJsonObject(rawResponse) as ModelReceiptOutput;

        const assembled = {
            categorizedItems: modelOutput.categorizedItems,
            processor: {
                finishedAt: finishedAt.toISOString(),
                modelVersions: [CLAUDE_MODEL ?? 'claude-cli-default'],
                pipelineVersion: PIPELINE_VERSION,
                startedAt: startedAt.toISOString(),
                workerId: WORKER_ID
            },
            rawOcrText: modelOutput.rawOcrText,
            receipt: modelOutput.receipt,
            schemaVersion: 1 as const,
            warnings: modelOutput.warnings ?? []
        };

        const validated = receiptWorkerResultSchema.safeParse(assembled);

        if (!validated.success) {
            throw new Error(
                `Local schema validation failed: ${validated.error.issues[0]?.message
                    ?? 'unknown error'}`
            );
        }

        await completeJob(job, validated.data);
        log(`Completed job ${job.processingJobId}.`);
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        log(`Job ${job.processingJobId} failed: ${message}`);
        await failJob(job, message).catch((failError: unknown) => {
            log(`Could not report failure to server: ${
                failError instanceof Error ? failError.message : String(failError)
            }`);
        });
    }
    finally {
        stopHeartbeat?.();

        if (imagePath !== undefined) {
            await rm(imagePath, { force: true });
        }
    }
}

async function mainLoop(): Promise<void> {
    log(`Receipt Claude worker starting as "${WORKER_ID}" against ${BASE_URL}.`);

    while (!shuttingDown) {
        try {
            const job = await leaseNextJob();

            if (job === undefined) {
                await sleep(withJitter(POLL_INTERVAL_MS));
                continue;
            }

            await processJob(job);
        }
        catch (error: unknown) {
            log(`Poll loop error: ${
                error instanceof Error ? error.message : String(error)
            }`);
            await sleep(withJitter(POLL_INTERVAL_MS));
        }
    }

    log('Receipt Claude worker stopped.');
}

function requestShutdown(signal: string): void {
    log(`Received ${signal}, finishing current iteration before exit...`);
    shuttingDown = true;
}

process.on('SIGINT', () => requestShutdown('SIGINT'));
process.on('SIGTERM', () => requestShutdown('SIGTERM'));

mainLoop().catch((error: unknown) => {
    console.error('Receipt Claude worker crashed.', error);
    process.exitCode = 1;
});
