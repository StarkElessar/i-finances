import { INVITATION_TOKEN_PATTERN } from '@i-finances/contracts';

/** The part of `Storage` the store needs; a test passes a plain object. */
export type PendingInvitationStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export const PENDING_INVITATION_STORAGE_KEY = 'i-finances.pending-invitation';

/**
 * The stored invitation: the token and the user it belongs to. `userId` is empty while nobody signed in has seen it
 * (the link was opened by a guest, or before the session was known); the first signed-in reader takes it.
 */
type PendingInvitationEntry = {
	token: string;
	userId?: string;
};

function parseEntry(stored: string | null | undefined): PendingInvitationEntry | undefined {
	if (stored === null || stored === undefined) {
		return undefined;
	}

	try {
		const value: unknown = JSON.parse(stored);

		if (typeof value !== 'object' || value === null) {
			return undefined;
		}

		const { token, userId } = value as Record<string, unknown>;

		if (typeof token !== 'string' || !INVITATION_TOKEN_PATTERN.test(token)) {
			return undefined;
		}

		return typeof userId === 'string' && userId !== '' ? { token, userId } : { token };
	}
	catch {
		return undefined;
	}
}

/**
 * The invitation token between the moment the page reads it from the address and the moment it is accepted or found
 * dead. It lives in `sessionStorage` only: it survives a sign-in, a reload and the remount after the session reload,
 * dies with the tab and is never shared with other tabs (a `localStorage` token would outlive the tab and open in the
 * next person's browser on a shared device, review of Р5). If the browser refuses storage (private mode, blocked site
 * data) the token is kept in memory, which is enough as long as the page is not reloaded.
 *
 * The token belongs to one person (review of U4): a guest's link goes to the first user who signs in, and from then on
 * only that user gets it back. Another user in the same tab gets nothing, and the token is dropped; nobody signed in
 * (the owner signed out or the session ended) gets nothing either, but the token waits for its owner. An explicit
 * sign-out clears it (`clear`).
 *
 * The token is a bearer secret of a family's finances: nothing here logs it or puts it into a message.
 */
export class PendingInvitationStore {
	private memoryEntry: PendingInvitationEntry | undefined;

	public constructor(private readonly storage: PendingInvitationStorage | undefined) {}

	/**
	 * The token for the person looking (`viewerId`, `undefined` for a guest), or `undefined` when there is none or it is
	 * not theirs. An unclaimed token is bound to the first signed-in reader; a token of another user is forgotten.
	 */
	public read(viewerId?: string): string | undefined {
		const entry = this.readEntry();

		if (entry === undefined) {
			return undefined;
		}

		if (entry.userId === undefined) {
			if (viewerId !== undefined) {
				this.write({ token: entry.token, userId: viewerId });
			}

			return entry.token;
		}

		if (entry.userId === viewerId) {
			return entry.token;
		}

		if (viewerId !== undefined) {
			this.clear();
		}

		return undefined;
	}

	public has(viewerId?: string): boolean {
		return this.read(viewerId) !== undefined;
	}

	/** Remembers a well-formed token for `viewerId` (unclaimed when `undefined`); anything else is ignored. */
	public save(token: string, viewerId?: string): void {
		if (!INVITATION_TOKEN_PATTERN.test(token)) {
			return;
		}

		this.write(viewerId === undefined ? { token } : { token, userId: viewerId });
	}

	public clear(): void {
		this.memoryEntry = undefined;

		try {
			this.storage?.removeItem(PENDING_INVITATION_STORAGE_KEY);
		}
		catch {
			// Nothing stored that could be removed.
		}
	}

	private write(entry: PendingInvitationEntry): void {
		this.memoryEntry = entry;

		try {
			this.storage?.setItem(PENDING_INVITATION_STORAGE_KEY, JSON.stringify(entry));
		}
		catch {
			// Storage refused: the memory copy stays.
		}
	}

	private readEntry(): PendingInvitationEntry | undefined {
		try {
			const stored = this.storage?.getItem(PENDING_INVITATION_STORAGE_KEY);

			if (stored !== undefined && stored !== null) {
				return parseEntry(stored);
			}
		}
		catch {
			// Storage refused: fall back to the memory copy.
		}

		return this.memoryEntry;
	}
}
