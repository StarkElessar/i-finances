import { getSessionStorage } from '@/shared/lib';

import { HouseholdLossNoticeStore } from './household-loss-notice-store';

export const householdLossNotice = new HouseholdLossNoticeStore(getSessionStorage());
