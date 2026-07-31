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
export type ReceiptProcessingJobStatus =
	typeof RECEIPT_PROCESSING_JOB_STATUSES[number];

export type ReceiptCategorySnapshot = {
    description: string;
    id: string;
    keywords: string[];
    name: string;
};

export type ReceiptMerchant = {
    address: string | null;
    displayName: string | null;
    legalName: string | null;
    unp: string | null;
};

export type ReceiptItem = {
    discountMinor: number;
    name: string;
    quantity: number | null;
    totalMinor: number;
    unitPriceMinor: number | null;
};

export type ReceiptItemCategory = {
    categoryId: string | null;
    confidence: number | null;
    itemIndex: number;
};

export type ReceiptWorkerResult = {
    categorizedItems: ReceiptItemCategory[];
    processor: {
        finishedAt: string;
        modelVersions: string[];
        pipelineVersion: string;
        startedAt: string;
        workerId: string;
    };
    rawOcrText: string;
    receipt: {
        currency: 'BYN';
        happenedOn: string;
        items: ReceiptItem[];
        merchant: ReceiptMerchant;
        totalAmountMinor: number;
    };
    schemaVersion: 1;
    warnings: string[];
};

export type ReceiptProcessingJob = {
    attempt: number;
    completedAt: string | null;
    createdAt: string;
    id: string;
    lastError: string | null;
    status: ReceiptProcessingJobStatus;
    updatedAt: string;
    workerId: string | null;
};

export type ReceiptImport = {
    accountId: string | null;
    approvedAt: string | null;
    categories: ReceiptCategorySnapshot[];
    categoriesSnapshotVersion: string;
    createdAt: string;
    id: string;
    imageContentType: string;
    imageDeletedAt: string | null;
    imageOriginalName: string;
    imageSizeBytes: number;
    imageUrl: string | null;
    latestJob: ReceiptProcessingJob;
    operationIds: string[];
    result: ReceiptWorkerResult | null;
    reviewComment: string;
    status: ReceiptImportStatus;
    updatedAt: string;
    version: number;
};

export type LeasedReceiptProcessingJob = {
    attempt: number;
    categories: ReceiptCategorySnapshot[];
    categoriesSnapshotVersion: string;
    imageUrl: string;
    leaseExpiresAt: string;
    leaseToken: string;
    previousResult: ReceiptWorkerResult | null;
    processingJobId: string;
    receiptImportId: string;
    requestedPipelineVersion: string;
    reviewComment: string;
    schemaVersion: 1;
};

export type CreatedReceiptImport = {
    id: string;
    status: ReceiptImportStatus;
};
