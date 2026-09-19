import type { DisplayModePreferenceControls } from '@/shared/lib';
import { useDisplayModePreference } from '@/shared/lib';

import { OPERATIONS_DISPLAY_MODE_STORAGE_KEY } from './display-mode';

export type OperationsDisplayMode = DisplayModePreferenceControls;

export function useOperationsDisplayMode(): OperationsDisplayMode {
	return useDisplayModePreference(OPERATIONS_DISPLAY_MODE_STORAGE_KEY);
}
