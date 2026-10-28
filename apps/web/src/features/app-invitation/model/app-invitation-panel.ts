import {
	APP_INVITATION_NOTE_MAX_LENGTH,
	type AppInvitationFailure,
	createAppInvitationInputSchema,
	MAX_ACTIVE_APP_INVITATIONS
} from '@i-finances/contracts';

import type { AppInvitationClient } from '../api/app-invitation-client';
import { describeAppInvitationError } from '../lib/app-invitation-error';

import type { AppInvitationPanelState } from './app-invitation-panel-state';
import { selectAppInvitations } from './select-app-invitations';

export type AppInvitationGateway = Pick<AppInvitationClient, 'create' | 'list' | 'revoke'>;

export type AppInvitationPanelOptions = {
	gateway: AppInvitationGateway;
	onChange: (state: AppInvitationPanelState) => void;
	onAccessLost: () => void;
	now?: () => number;
};

function initialState(): AppInvitationPanelState {
	return { expanded: false, invitations: [], load: 'loading', note: '', view: 'main' };
}

/** One opening owns one model. Disposal clears the link and ignores every outstanding response. */
export class AppInvitationPanel {
	private current = initialState();
	private disposed = false;

	public constructor(private readonly options: AppInvitationPanelOptions) {}

	public get state(): AppInvitationPanelState {
		return this.current;
	}

	public async load(): Promise<void> {
		if (this.disposed || this.current.busy || this.current.load === 'forbidden') {
			return;
		}

		this.patch({ busy: 'load', error: undefined, load: 'loading' });

		try {
			const result = await this.options.gateway.list();

			if (result.ok) {
				this.patch({ invitations: result.invitations, limitReached: false, load: 'ready' });
			}
			else {
				this.patch({ error: result.message, load: 'failed' });

				if (result.errorCode === 'unauthenticated') {
					this.loseAccess(result.message);
				}
			}
		}
		catch (error: unknown) {
			this.patch({ load: 'failed' });
			this.fail(error, false);
		}
		finally {
			this.patch({ busy: undefined });
		}
	}

	public startCreate(): void {
		if (!this.canAct() || this.current.view !== 'main' || this.current.confirmingId || this.isFull() || this.isCoolingDown()) {
			return;
		}

		this.patch({ error: undefined, note: '', noteError: undefined, view: 'create' });
	}

	public setNote(note: string): void {
		if (this.canAct() && this.current.view === 'create') {
			this.patch({ error: undefined, note, noteError: this.validateNote(note) });
		}
	}

	public async create(): Promise<void> {
		if (!this.canAct() || this.current.view !== 'create' || this.isCoolingDown() || this.isFull()) {
			return;
		}

		const noteError = this.validateNote(this.current.note);

		if (noteError) {
			this.patch({ noteError });
			return;
		}

		const note = this.current.note.trim();

		this.patch({ busy: 'create', error: undefined, noteError: undefined });

		try {
			const result = await this.options.gateway.create(note ? { note } : {});

			if (result.ok) {
				const { expiresAt, id } = result.invitation;

				this.patch({
					created: result.invitation,
					invitations: [{
						acceptedAt: null,
						acceptedBy: null,
						createdAt: new Date(this.now()).toISOString(),
						expiresAt,
						id,
						note: note || null,
						status: 'active'
					}, ...this.current.invitations],
					note: '',
					view: 'created'
				});
			}
			else {
				this.refused(result, false);
			}
		}
		catch (error: unknown) {
			this.fail(error, false);
		}
		finally {
			this.patch({ busy: undefined });
		}
	}

	public back(): void {
		if (this.canAct()) {
			const shouldReload = this.current.limitReached === true;

			this.patch({ created: undefined, error: undefined, note: '', noteError: undefined, view: 'main' });

			if (shouldReload) {
				void this.load();
			}
		}
	}

	public toggleAccepted(): void {
		if (this.canAct()) {
			this.patch({ expanded: !this.current.expanded });
		}
	}

	public askRevoke(id: string): void {
		if (this.canAct() && this.current.view === 'main'
			&& this.current.invitations.some((invitation) => invitation.id === id && invitation.status === 'active')) {
			this.patch({ confirmError: undefined, confirmingId: id, error: undefined });
		}
	}

	public cancelRevoke(): void {
		if (this.canAct()) {
			this.patch({ confirmError: undefined, confirmingId: undefined });
		}
	}

	public async confirmRevoke(): Promise<void> {
		const id = this.current.confirmingId;

		if (!this.canAct() || !id) {
			return;
		}

		let reloadMessage: string | undefined;

		this.patch({ busy: 'revoke', confirmError: undefined });

		try {
			const result = await this.options.gateway.revoke(id);

			if (result.ok) {
				this.patch({
					confirmingId: undefined,
					invitations: this.current.invitations.filter((invitation) => invitation.id !== id),
					limitReached: false
				});
			}
			else if (result.errorCode === 'invitation-not-found') {
				reloadMessage = result.message;
				this.patch({ confirmError: undefined, confirmingId: undefined });
			}
			else {
				this.refused(result, true);
			}
		}
		catch (error: unknown) {
			this.fail(error, true);
		}
		finally {
			this.patch({ busy: undefined });
		}

		if (reloadMessage !== undefined) {
			await this.load();

			if (this.current.load === 'ready') {
				this.patch({ error: reloadMessage });
			}
		}
	}

	public dispose(): void {
		this.current = initialState();
		this.options.onChange(this.current);
		this.disposed = true;
	}

	private now(): number {
		return this.options.now?.() ?? Date.now();
	}

	private canAct(): boolean {
		return !this.disposed && !this.current.busy && this.current.load === 'ready';
	}

	private isFull(): boolean {
		return this.current.limitReached === true
			|| selectAppInvitations(this.current.invitations, false).active.length >= MAX_ACTIVE_APP_INVITATIONS;
	}

	private isCoolingDown(): boolean {
		return (this.current.createRetryAt ?? 0) > this.now();
	}

	private validateNote(note: string): string | undefined {
		if (note.length > APP_INVITATION_NOTE_MAX_LENGTH) {
			return `Заметка не длиннее ${APP_INVITATION_NOTE_MAX_LENGTH} символов.`;
		}

		const parsed = createAppInvitationInputSchema.safeParse({ note });

		return parsed.success ? undefined : parsed.error.issues[0]?.message;
	}

	private refused(result: AppInvitationFailure & { retryAfterSeconds?: number }, confirmation: boolean): void {
		if (result.errorCode === 'unauthenticated') {
			this.loseAccess(result.message);
			return;
		}

		this.patch(confirmation ? { confirmError: result.message } : {
			createRetryAt: result.errorCode === 'rate-limited' && result.retryAfterSeconds !== undefined
				? this.now() + result.retryAfterSeconds * 1000 : undefined,
			error: result.message,
			limitReached: result.errorCode === 'invitation-limit-reached',
			noteError: result.fieldErrors?.note
		});
	}

	private fail(error: unknown, confirmation: boolean): void {
		const failure = describeAppInvitationError(error);

		if (failure.forbidden) {
			this.loseAccess(failure.message);
			return;
		}

		this.patch(confirmation ? { confirmError: failure.message } : { error: failure.message });
	}

	private loseAccess(message: string): void {
		if (!this.disposed) {
			this.current = { ...initialState(), error: message, load: 'forbidden' };
			this.options.onChange(this.current);
			this.options.onAccessLost();
		}
	}

	private patch(patch: Partial<AppInvitationPanelState>): void {
		if (!this.disposed) {
			this.current = { ...this.current, ...patch };
			this.options.onChange(this.current);
		}
	}
}
