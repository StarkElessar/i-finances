import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    assertReceiptWorkerApiKey,
    ReceiptWorkerAuthenticationError,
    ReceiptWorkerConfigurationError
} from '~/server/receipt-import/receipt-worker-auth';

const API_KEY = 'a'.repeat(48);

let originalApiKey: string | undefined;

beforeEach(() => {
    originalApiKey = process.env.RECEIPT_WORKER_API_KEY;
});

afterEach(() => {
    if (originalApiKey === undefined) {
        delete process.env.RECEIPT_WORKER_API_KEY;
        return;
    }

    process.env.RECEIPT_WORKER_API_KEY = originalApiKey;
});

describe('receipt worker API key', () => {
    it('accepts the configured Bearer key', () => {
        process.env.RECEIPT_WORKER_API_KEY = API_KEY;

        expect(() => assertReceiptWorkerApiKey(new Request(
            'https://example.test/api/receipt-worker/jobs/lease',
            {
                headers: {
                    Authorization: `Bearer ${API_KEY}`
                }
            }
        ))).not.toThrow();
    });

    it('rejects a different Bearer key', () => {
        process.env.RECEIPT_WORKER_API_KEY = API_KEY;

        expect(() => assertReceiptWorkerApiKey(new Request(
            'https://example.test/api/receipt-worker/jobs/lease',
            {
                headers: {
                    Authorization: `Bearer ${'b'.repeat(48)}`
                }
            }
        ))).toThrow(ReceiptWorkerAuthenticationError);
    });

    it('fails closed when no integration key is configured', () => {
        delete process.env.RECEIPT_WORKER_API_KEY;

        expect(() => assertReceiptWorkerApiKey(new Request(
            'https://example.test/api/receipt-worker/jobs/lease'
        ))).toThrow(ReceiptWorkerConfigurationError);
    });
});
