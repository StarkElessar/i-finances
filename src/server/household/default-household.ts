import { CurrencyCode, type CurrencyCodeValue } from '~/shared/lib';

/**
 * Single household used until the product gets household management UI.
 */
export const DEFAULT_HOUSEHOLD_ID = 'default-household';

/**
 * Human-readable fallback name for the first shared finance workspace.
 */
export const DEFAULT_HOUSEHOLD_NAME = 'Семья';

/**
 * Base currency used for family-wide calculations in the first backend stage.
 */
export const DEFAULT_HOUSEHOLD_BASE_CURRENCY: CurrencyCodeValue = CurrencyCode.BYN;
