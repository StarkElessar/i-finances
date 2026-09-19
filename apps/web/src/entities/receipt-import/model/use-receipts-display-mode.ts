import type { DisplayModePreferenceControls } from '@/shared/lib';
import { useDisplayModePreference } from '@/shared/lib';

/**
 * localStorage key for the user's manual receipts-view preference. Kept
 * independent from `OPERATIONS_DISPLAY_MODE_STORAGE_KEY` — the two screens
 * remember their own table/list choice separately.
 */
export const RECEIPTS_DISPLAY_MODE_STORAGE_KEY = 'i-finances:receipts-display-mode';

export type ReceiptsDisplayMode = DisplayModePreferenceControls;

export function useReceiptsDisplayMode(): ReceiptsDisplayMode {
	return useDisplayModePreference(RECEIPTS_DISPLAY_MODE_STORAGE_KEY);
}
