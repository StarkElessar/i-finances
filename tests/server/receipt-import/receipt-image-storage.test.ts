import {
    mkdtemp,
    rm
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import { createReceiptImageStorage } from '~/server/receipt-import/receipt-image-storage';
import {
    ReceiptImageValidationError
} from '~/server/receipt-import/receipt-import-errors';

let temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.map(
        (directory) => rm(directory, { force: true, recursive: true })
    ));
    temporaryDirectories = [];
});

async function createTemporaryRoot(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'receipt-storage-'));

    temporaryDirectories.push(directory);

    return directory;
}

describe('receipt image storage', () => {
    it('writes, reads and deletes an image by an opaque storage key', async () => {
        const rootDirectory = await createTemporaryRoot();
        const storage = createReceiptImageStorage({ rootDirectory });
        const stored = await storage.save({
            bytes: new Uint8Array([1, 2, 3]),
            contentType: 'image/jpeg',
            originalName: '../../unsafe-name.jpg',
            receiptImportId: 'receipt-1'
        });

        expect(stored).toMatchObject({
            originalName: 'unsafe-name.jpg',
            sizeBytes: 3,
            storageKey: 'receipt-1.jpg'
        });
        expect([...await storage.read(stored.storageKey)]).toEqual([1, 2, 3]);

        await storage.delete(stored.storageKey);
        await expect(storage.read(stored.storageKey)).rejects.toThrow();
    });

    it('rejects unsupported content types before writing a file', async () => {
        const rootDirectory = await createTemporaryRoot();
        const storage = createReceiptImageStorage({ rootDirectory });

        await expect(storage.save({
            bytes: new Uint8Array([1]),
            contentType: 'application/pdf',
            originalName: 'receipt.pdf',
            receiptImportId: 'receipt-1'
        })).rejects.toBeInstanceOf(ReceiptImageValidationError);
    });

    it('rejects traversal when reading a storage key', async () => {
        const rootDirectory = await createTemporaryRoot();
        const storage = createReceiptImageStorage({ rootDirectory });

        await expect(storage.read('../secret.jpg'))
            .rejects.toBeInstanceOf(ReceiptImageValidationError);
    });
});
