import { z } from 'zod';

export const RECEIPT_IMPORT_STATUSES = [
	'queued',
	'processing',
	'needs_review',
	'revision_requested',
	'approving',
	'approved',
	'failed',
	'cancelled'
] as const;

export const RECEIPT_PROCESSING_JOB_STATUSES = [
	'queued',
	'leased',
	'completed',
	'failed',
	'cancelled'
] as const;

export type ReceiptImportStatus = typeof RECEIPT_IMPORT_STATUSES[number];
export type ReceiptProcessingJobStatus = typeof RECEIPT_PROCESSING_JOB_STATUSES[number];

const entityIdSchema = z.string().trim().min(1).max(128);
const positiveIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonnegativeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const localDateKeySchema = z.string()
	.regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, 'Дата должна быть в формате YYYY-MM-DD.');
const nullableTextSchema = z.string().trim().max(500).nullable();

export const receiptCategorySnapshotSchema = z.object({
	// Older persisted snapshots predate category descriptions.
	description: z.string().trim().max(2_000).default(''),
	id: entityIdSchema,
	keywords: z.array(z.string().trim().min(1).max(160)).max(500),
	name: z.string().trim().min(1).max(120)
});

export type ReceiptCategorySnapshot = z.infer<typeof receiptCategorySnapshotSchema>;

export const receiptItemSchema = z.object({
	discountMinor: nonnegativeIntegerSchema,
	name: z.string().trim().min(1).max(500),
	quantity: z.number().positive().nullable(),
	totalMinor: nonnegativeIntegerSchema,
	unitPriceMinor: nonnegativeIntegerSchema.nullable()
});

export type ReceiptItem = z.infer<typeof receiptItemSchema>;

export const receiptMerchantSchema = z.object({
	address: nullableTextSchema,
	displayName: nullableTextSchema,
	legalName: nullableTextSchema,
	unp: z.string().trim().max(32).nullable()
});

export const receiptCategorizedItemSchema = z.object({
	categoryId: entityIdSchema.nullable(),
	confidence: z.number().min(0).max(1).nullable(),
	itemIndex: z.number().int().nonnegative()
});

export type ReceiptCategorizedItem = z.infer<typeof receiptCategorizedItemSchema>;

export const receiptWorkerResultSchema = z.object({
	categorizedItems: z.array(receiptCategorizedItemSchema).max(1_000),
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
		merchant: receiptMerchantSchema,
		totalAmountMinor: positiveIntegerSchema
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

export type ReceiptWorkerResult = z.infer<typeof receiptWorkerResultSchema>;

export const receiptReviewSchema = z.object({
	categorizedItems: z.array(receiptCategorizedItemSchema).max(1_000),
	happenedOn: localDateKeySchema,
	items: z.array(receiptItemSchema).min(1).max(1_000),
	merchant: receiptMerchantSchema,
	totalAmountMinor: positiveIntegerSchema
}).superRefine((review, context) => {
	const itemIndexes = new Set<number>();

	review.categorizedItems.forEach((item, index) => {
		if (item.itemIndex >= review.items.length) {
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

	if (itemIndexes.size !== review.items.length) {
		context.addIssue({
			code: 'custom',
			message: 'Категория должна быть указана для каждой строки чека.',
			path: ['categorizedItems']
		});
	}
});

export type ReceiptReview = z.infer<typeof receiptReviewSchema>;

export const updateReceiptReviewInputSchema = z.object({
	id: entityIdSchema,
	review: receiptReviewSchema,
	version: z.number().int().positive()
});

export type UpdateReceiptReviewInput = z.infer<typeof updateReceiptReviewInputSchema>;

export const requestReceiptRevisionInputSchema = z.object({
	comment: z.string().trim().min(1, 'Опишите, что нужно исправить.').max(2_000),
	id: entityIdSchema,
	version: z.number().int().positive()
});

export type RequestReceiptRevisionInput = z.infer<typeof requestReceiptRevisionInputSchema>;

export const approveReceiptInputSchema = z.object({
	accountId: entityIdSchema,
	id: entityIdSchema,
	version: z.number().int().positive()
});

export type ApproveReceiptInput = z.infer<typeof approveReceiptInputSchema>;

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
export const receiptProcessingJobStatusSchema = z.enum(RECEIPT_PROCESSING_JOB_STATUSES);

export type WorkerIdentity = z.infer<typeof workerIdentitySchema>;
export type CompleteReceiptJobInput = z.infer<typeof completeReceiptJobInputSchema>;
export type FailReceiptJobInput = z.infer<typeof failReceiptJobInputSchema>;
export type HeartbeatReceiptJobInput = z.infer<typeof heartbeatReceiptJobInputSchema>;

const receiptProcessingJobSchema = z.object({
	attempt: z.number().int().nonnegative(),
	completedAt: z.string().nullable(),
	createdAt: z.string(),
	id: entityIdSchema,
	lastError: z.string().nullable(),
	status: receiptProcessingJobStatusSchema,
	updatedAt: z.string(),
	workerId: z.string().nullable()
});

export type ReceiptProcessingJob = z.infer<typeof receiptProcessingJobSchema>;

export const receiptImportSchema = z.object({
	accountId: entityIdSchema.nullable(),
	approvedAt: z.string().nullable(),
	categories: z.array(receiptCategorySnapshotSchema),
	categoriesSnapshotVersion: z.string().min(1),
	createdAt: z.string(),
	id: entityIdSchema,
	imageContentType: z.string().min(1),
	imageDeletedAt: z.string().nullable(),
	imageOriginalName: z.string().min(1),
	imageSizeBytes: positiveIntegerSchema,
	imageUrl: z.string().nullable(),
	latestJob: receiptProcessingJobSchema,
	operationIds: z.array(entityIdSchema),
	result: receiptWorkerResultSchema.nullable(),
	reviewComment: z.string(),
	status: receiptImportStatusSchema,
	updatedAt: z.string(),
	version: z.number().int().positive()
});

export type ReceiptImport = z.infer<typeof receiptImportSchema>;

export const receiptImportCollectionSchema = z.array(receiptImportSchema);
export type ReceiptImportCollection = z.infer<typeof receiptImportCollectionSchema>;

export const createdReceiptImportSchema = z.object({
	id: entityIdSchema,
	status: receiptImportStatusSchema
});

export type CreatedReceiptImport = z.infer<typeof createdReceiptImportSchema>;

export const createdReceiptImportResponseSchema = z.object({
	ok: z.literal(true),
	receiptImport: createdReceiptImportSchema
});

export const leasedReceiptProcessingJobSchema = z.object({
	attempt: z.number().int().positive(),
	categories: z.array(receiptCategorySnapshotSchema),
	categoriesSnapshotVersion: z.string().min(1),
	imageUrl: z.string().min(1),
	leaseExpiresAt: z.string(),
	leaseToken: z.string().min(32),
	previousResult: receiptWorkerResultSchema.nullable(),
	processingJobId: entityIdSchema,
	receiptImportId: entityIdSchema,
	requestedPipelineVersion: z.string().min(1),
	reviewComment: z.string(),
	schemaVersion: z.literal(1)
});

export type LeasedReceiptProcessingJob = z.infer<typeof leasedReceiptProcessingJobSchema>;

export const receiptImportCommandErrorCodeSchema = z.enum([
	'conflict',
	'forbidden',
	'invalid-input',
	'invalid-state',
	'not-found',
	'unauthenticated',
	'worker-authentication',
	'worker-configuration'
]);

export type ReceiptImportCommandErrorCode = z.infer<typeof receiptImportCommandErrorCodeSchema>;

export const receiptImportCommandResultSchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		receiptImport: receiptImportSchema
	}),
	z.object({
		errorCode: receiptImportCommandErrorCodeSchema,
		fieldErrors: z.record(z.string(), z.string()).optional(),
		message: z.string(),
		ok: z.literal(false)
	})
]);

export type ReceiptImportCommandResult = z.infer<typeof receiptImportCommandResultSchema>;

export const receiptJobCommandResponseSchema = z.object({
	ok: z.literal(true),
	receiptImport: receiptImportSchema
});

export const receiptWorkerLeaseResponseSchema = z.object({
	job: leasedReceiptProcessingJobSchema.nullable(),
	ok: z.literal(true)
});

export const receiptWorkerResultResponseSchema = z.object({
	ok: z.literal(true),
	receiptImportId: entityIdSchema,
	status: receiptImportStatusSchema
});

export const receiptHeartbeatResponseSchema = z.object({
	leaseExpiresAt: z.string(),
	ok: z.literal(true)
});
