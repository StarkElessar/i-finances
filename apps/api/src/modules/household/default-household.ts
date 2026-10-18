import type { CurrencyCode } from '@i-finances/contracts';

/**
 * The household that existed before households were created explicitly. Its id is the primary key seven tables
 * reference, so it is never renamed (Р8). Only the development seed script and the legacy public category route
 * (`GET /api/public/categories`, kept open until the owner decides, A8) refer to it; the resolver never does.
 */
export const DEFAULT_HOUSEHOLD_ID = 'default-household';
export const DEFAULT_HOUSEHOLD_NAME = 'Семья';
export const DEFAULT_HOUSEHOLD_BASE_CURRENCY: CurrencyCode = 'BYN';
