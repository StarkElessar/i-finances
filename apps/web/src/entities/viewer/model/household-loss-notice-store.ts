export type HouseholdLossNoticeStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export const HOUSEHOLD_LOSS_NOTICE_STORAGE_KEY = 'i-finances.lost-household';

type HouseholdLossNotice = {
	householdName: string;
	userId: string;
};

function parseNotice(stored: string | null | undefined): HouseholdLossNotice | undefined {
	if (stored === null || stored === undefined) {
		return undefined;
	}

	try {
		const value: unknown = JSON.parse(stored);

		if (typeof value !== 'object' || value === null) {
			return undefined;
		}

		const { householdName, userId } = value as Record<string, unknown>;

		return typeof householdName === 'string' && householdName !== '' && typeof userId === 'string' && userId !== ''
			? { householdName, userId }
			: undefined;
	}
	catch {
		return undefined;
	}
}

/**
 * The name of the household a person was in when the server stopped letting them in (a removed member loses their
 * sessions, so the next request is a 401; a household that is gone answers `household-required`). The onboarding shows
 * it as «Вы больше не участник окружения «Семья»» after the person signs in again (board `Flow-Onboarding`, card 6,
 * section 6.9 of `development/decisions/telegram-auth-and-households-v1.md`). Kept in `sessionStorage` of the tab and
 * never in `localStorage`, and tied to the user who lost the household: another account signing in in the same tab
 * never sees the name, and the notice is dropped then (review of U3).
 */
export class HouseholdLossNoticeStore {
	public constructor(private readonly storage: HouseholdLossNoticeStorage | undefined) {}

	/** The lost household of `viewerId`, or `undefined`; a notice of another user is forgotten. */
	public read(viewerId: string | undefined): string | undefined {
		let notice: HouseholdLossNotice | undefined;

		try {
			notice = parseNotice(this.storage?.getItem(HOUSEHOLD_LOSS_NOTICE_STORAGE_KEY));
		}
		catch {
			return undefined;
		}

		if (notice === undefined || viewerId === undefined) {
			return undefined;
		}

		if (notice.userId !== viewerId) {
			this.clear();
			return undefined;
		}

		return notice.householdName;
	}

	public save(userId: string, householdName: string): void {
		try {
			this.storage?.setItem(HOUSEHOLD_LOSS_NOTICE_STORAGE_KEY, JSON.stringify({ householdName, userId }));
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
