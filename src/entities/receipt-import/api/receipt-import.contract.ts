import { z } from 'zod';

import type { ReceiptImport } from '~/entities/receipt-import/model/types';
import {
    RECEIPT_IMPORT_STATUSES,
    RECEIPT_PROCESSING_JOB_STATUSES
} from '~/entities/receipt-import/model/types';

const entityIdSchema = z.string().trim().min(1).max(128);
const safeMinorAmountSchema = z.number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER);
const nullableTextSchema = z.string().trim().max(500).nullable();
const localDateKeySchema = z.string().regex(
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/,
    'Дата должна быть в формате YYYY-MM-DD.'
);

export const receiptCategorySnapshotSchema = z.object({
    id: entityIdSchema,
    keywords: z.array(z.string().trim().min(1).max(160)).max(500),
    name: z.string().trim().min(1).max(120)
});

export const receiptItemSchema = z.object({
    discountMinor: safeMinorAmountSchema,
    name: z.string().trim().min(1).max(500),
    quantity: z.number().positive().nullable(),
    totalMinor: safeMinorAmountSchema,
    unitPriceMinor: safeMinorAmountSchema.nullable()
});

export const receiptWorkerResultSchema = z.object({
    categorizedItems: z.array(z.object({
        categoryId: entityIdSchema.nullable(),
        confidence: z.number().min(0).max(1).nullable(),
        itemIndex: z.number().int().nonnegative()
    })).max(1_000),
    processor: z.object({
        finishedAt: z.iso.datetime(),
        modelVersions: z.array(z.string().trim().min(1).max(200)).max(20),
        pipelineVersion: z.string().trim().min(1).max(100),
        startedAt: z.iso.datetime(),
        workerId: z.string().trim().min(1).max(128)
    }),
    rawOcrText: z.string().max(500_000),
    receipt: z.object({
        currency: z.literal('BYN'),
        happenedOn: localDateKeySchema,
        items: z.array(receiptItemSchema).min(1).max(1_000),
        merchant: z.object({
            address: nullableTextSchema,
            displayName: nullableTextSchema,
            legalName: nullableTextSchema,
            unp: z.string().trim().max(32).nullable()
        }),
        totalAmountMinor: z.number()
            .int()
            .positive()
            .max(Number.MAX_SAFE_INTEGER)
    }),
    schemaVersion: z.literal(1),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(100)
}).superRefine((result, context) => {
    const itemIndexes = new Set<number>();

    result.categorizedItems.forEach((item, index) => {
        if (item.itemIndex >= result.receipt.items.length) {
            context.addIssue({
                code: 'custom',
                message: 'Категоризация ссылается на отсутствующую строку чека.',
                path: ['categorizedItems', index, 'itemIndex']
            });
        }

        if (itemIndexes.has(item.itemIndex)) {
            context.addIssue({
                code: 'custom',
                message: 'Строка чека не может иметь две категории.',
                path: ['categorizedItems', index, 'itemIndex']
            });
        }

        itemIndexes.add(item.itemIndex);
    });

    if (itemIndexes.size !== result.receipt.items.length) {
        context.addIssue({
            code: 'custom',
            message: 'Категория должна быть указана для каждой строки чека.',
            path: ['categorizedItems']
        });
    }
});

export const requestReceiptRevisionInputSchema = z.object({
    comment: z.string()
        .trim()
        .min(1, 'Опишите, что нужно исправить.')
        .max(2_000),
    id: entityIdSchema,
    version: z.number().int().positive()
});

export const approveReceiptInputSchema = z.object({
    accountId: entityIdSchema,
    id: entityIdSchema,
    version: z.number().int().positive()
});

export const workerIdentitySchema = z.object({
    workerId: z.string().trim().min(1).max(128)
});

export const completeReceiptJobInputSchema = z.object({
    leaseToken: z.string().trim().min(32).max(512),
    result: receiptWorkerResultSchema
});

export const failReceiptJobInputSchema = z.object({
    error: z.string().trim().min(1).max(2_000),
    leaseToken: z.string().trim().min(32).max(512)
});

export const heartbeatReceiptJobInputSchema = z.object({
    leaseToken: z.string().trim().min(32).max(512)
});

export const receiptImportStatusSchema = z.enum(RECEIPT_IMPORT_STATUSES);
export const receiptProcessingJobStatusSchema = z.enum(
    RECEIPT_PROCESSING_JOB_STATUSES
);

export type ApproveReceiptInput = z.infer<typeof approveReceiptInputSchema>;
export type CompleteReceiptJobInput = z.infer<
	typeof completeReceiptJobInputSchema
>;
export type FailReceiptJobInput = z.infer<typeof failReceiptJobInputSchema>;
export type HeartbeatReceiptJobInput = z.infer<
	typeof heartbeatReceiptJobInputSchema
>;
export type RequestReceiptRevisionInput = z.infer<
	typeof requestReceiptRevisionInputSchema
>;
export type WorkerIdentity = z.infer<typeof workerIdentitySchema>;

export type ReceiptImportCommandErrorCode =
	| 'conflict'
	| 'forbidden'
	| 'invalid-input'
	| 'invalid-state'
	| 'not-found'
	| 'rate-unavailable'
	| 'reference-unavailable'
	| 'unauthenticated';

export type ReceiptImportCommandResult =
	| {
	    ok: true;
	    receiptImport: ReceiptImport;
	}
	| {
	    errorCode: ReceiptImportCommandErrorCode;
	    fieldErrors?: Record<string, string>;
	    message: string;
	    ok: false;
	};
