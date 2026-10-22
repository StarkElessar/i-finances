export type HouseholdLossNoticeStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export const HOUSEHOLD_LOSS_NOTICE_STORAGE_KEY = 'i-finances.lost-household';

/**
 * The name of the household a person was in when the server stopped letting them in (a removed member loses their
 * sessions, so the next request is a 401; a household that is gone answers `household-required`). The onboarding shows
 * it as «Вы больше не участник окружения «Семья»» after the person signs in again (board `Flow-Onboarding`, card 6,
 * section 6.9 of `development/decisions/telegram-auth-and-households-v1.md`). Kept in `sessionStorage` of the tab and
 * never in `localStorage`: a notice meant for one person must not greet the next one on the device.
 */
export class HouseholdLossNoticeStore {
	public constructor(private readonly storage: HouseholdLossNoticeStorage | undefined) {}

	public read(): string | undefined {
		try {
			const stored = this.storage?.getItem(HOUSEHOLD_LOSS_NOTICE_STORAGE_KEY);

			return stored === null || stored === undefined || stored === '' ? undefined : stored;
		}
		catch {
			return undefined;
		}
	}

	public save(householdName: string): void {
		try {
			this.storage?.setItem(HOUSEHOLD_LOSS_NOTICE_STORAGE_KEY, householdName);
		}
		catch {
			// No storage: the person simply does not get the notice.
		}
	}

	public clear(): void {
		try {
			this.storage?.removeItem(HOUSEHOLD_LOSS_NOTICE_STORAGE_KEY);
		}
		catch {
			// Nothing stored that could be removed.
		}
	}
}
