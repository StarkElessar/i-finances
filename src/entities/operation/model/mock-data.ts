import rawOperationsCsv from '../../../../db-2026.csv?raw';

import { importOperationsCsv } from './import-csv';

const importedData = importOperationsCsv(rawOperationsCsv, {
    accountId: 'legacy-csv-account'
});

export const INITIAL_OPERATIONS = importedData.operations;
