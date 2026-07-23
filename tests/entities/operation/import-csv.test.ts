import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { importOperationsCsv } from '~/entities/operation';

const rawCsv = readFileSync(new URL('../../../db-2026.csv', import.meta.url), 'utf8');

describe('importOperationsCsv', () => {
    it('imports the complete iFinance export', () => {
        const importedData = importOperationsCsv(rawCsv, {
            accountId: 'account-test'
        });

        expect(importedData.operations).toHaveLength(791);
        expect(importedData.categories).toHaveLength(30);
        expect(importedData.contacts).toHaveLength(116);
        expect(importedData.contacts[0]).toMatchObject({
            isArchived: false,
            legalName: null,
            type: 'unknown'
        });
        expect(importedData.operations[0].accountId).toBe('account-test');
        expect(importedData.contacts[0].color).toMatch(/^#[\da-f]{6}$/i);
    });

    it('normalizes money, dates and escaped contact quotes', () => {
        const importedData = importOperationsCsv(rawCsv, {
            accountId: 'account-test'
        });
        const [income, expense] = importedData.operations;

        expect(income).toMatchObject({
            amountMinor: 139_865,
            happenedOn: '2026-07-17',
            title: 'Детские',
            type: 'income'
        });
        expect(expense).toMatchObject({
            amountMinor: 4_794,
            contactName: 'ООО "Парфюм Трейд"',
            type: 'expense'
        });
    });
});
