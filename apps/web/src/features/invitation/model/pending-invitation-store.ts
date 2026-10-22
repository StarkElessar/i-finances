import { INVITATION_TOKEN_PATTERN } from '@i-finances/contracts';

/** The part of `Storage` the store needs; a test passes a plain object. */
export type PendingInvitationStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export const PENDING_INVITATION_STORAGE_KEY = 'i-finances.pending-invitation';

/**
 * The invitation token between the moment the page reads it from the address and the moment it is accepted or found
 * dead. It lives in `sessionStorage` only: it survives a sign-in, a reload and the remount after the session reload,
 * dies with the tab and is never shared with other tabs (a `localStorage` token would outlive the tab and open in the
 * next person's browser on a shared device, review of Р5). If the browser refuses storage (private mode, blocked site
 * data) the token is kept in memory, which is enough as long as the page is not reloaded.
 *
 * The token is a bearer secret of a family's finances: nothing here logs it or puts it into a message.
 */
export class PendingInvitationStore {
	private memoryToken: string | undefined;

	public constructor(private readonly storage: PendingInvitationStorage | undefined) {}

	/** The remembered token, or `undefined` when there is none or the stored value is not a well-formed token. */
	public read(): string | undefined {
		const stored = this.readStored();
		const token = stored ?? this.memoryToken;

		return token !== undefined && INVITATION_TOKEN_PATTERN.test(token) ? token : undefined;
	}

	public has(): boolean {
		return this.read() !== undefined;
	}

	/** Remembers a well-formed token; anything else is ignored. */
	public save(token: string): void {
		if (!INVITATION_TOKEN_PATTERN.test(token)) {
			return;
		}

		this.memoryToken = token;

		try {
			this.storage?.setItem(PENDING_INVITATION_STORAGE_KEY, token);
		}
		catch {
			// Storage refused: the memory copy stays.
		}
	}

	public clear(): void {
		this.memoryToken = undefined;

		try {
			this.storage?.removeItem(PENDING_INVITATION_STORAGE_KEY);
		}
		catch {
			// Nothing stored that could be removed.
		}
	}

	private readStored(): string | undefined {
		try {
			return this.storage?.getItem(PENDING_INVITATION_STORAGE_KEY) ?? undefined;
		}
		catch {
			return undefined;
		}
	}
}
