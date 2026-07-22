import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { importOperationsCsv } from '~/entities/operation';

const rawCsv = readFileSync(new URL('../../../db-2026.csv', import.meta.url), 'utf8');

describe('importOperationsCsv', () => {
    it('imports the complete iFinance export', () => {
        const importedData = importOperationsCsv(rawCsv);

        expect(importedData.operations).toHaveLength(791);
        expect(importedData.categories).toHaveLength(30);
        expect(importedData.payees).toHaveLength(116);
    });

    it('normalizes money, dates and escaped payee quotes', () => {
        const importedData = importOperationsCsv(rawCsv);
        const [income, expense] = importedData.operations;

        expect(income).toMatchObject({
            amountMinor: 139_865,
            happenedOn: '2026-07-17',
            title: 'Детские',
            type: 'income'
        });
        expect(expense).toMatchObject({
            amountMinor: 4_794,
            payeeName: 'ООО "Парфюм Трейд"',
            type: 'expense'
        });
    });
});
