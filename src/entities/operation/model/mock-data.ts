import rawOperationsCsv from '../../../../db-2026.csv?raw';

import { importOperationsCsv } from './import-csv';

const importedData = importOperationsCsv(rawOperationsCsv);

export const INITIAL_OPERATIONS = importedData.operations;
export const INITIAL_OPERATION_CATEGORIES = importedData.categories;
export const INITIAL_CONTACTS = importedData.contacts;
