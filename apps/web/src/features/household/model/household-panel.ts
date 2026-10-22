import { ApiHttpError } from '@/shared/api';

import {
	type ActiveHouseholdInvitation,
	type HouseholdDetails,
	type HouseholdSummary,
	updateHouseholdInputSchema
} from '@i-finances/contracts';

import type { HouseholdClient } from '../api/household-client';
import type { HouseholdInvitationClient } from '../api/household-invitation-client';

import type { HouseholdBusy, HouseholdConfirmation, HouseholdPanelState } from './household-panel-state';

export type HouseholdPanelGateway = {
	household: Pick<HouseholdClient, 'get' | 'leave' | 'removeMember' | 'rename'>;
	invitations: Pick<HouseholdInvitationClient, 'create' | 'list' | 'revoke'>;
};

export type HouseholdPanelOptions = {
	gateway: HouseholdPanelGateway;
	/** The person left: the caller patches the viewer (no household), forgets cached data and closes the dialog. */
	onLeft: () => void;
	onChange: (state: HouseholdPanelState) => void;
	/** The owner renamed the household: the caller patches the viewer. */
	onRenamed: (household: HouseholdSummary) => void;
};

export const NETWORK_MESSAGE = 'Не удалось выполнить действие. Проверьте соединение и повторите.';

const UNEXPECTED_MESSAGE = 'Не удалось выполнить действие. Попробуйте ещё раз.';

const LOAD_FAILED_MESSAGE = 'Не удалось загрузить окружение. Проверьте соединение и повторите.';

const INVITATIONS_FAILED_MESSAGE = 'Не удалось загрузить приглашения. Проверьте соединение и повторите.';

function describeThrown(error: unknown): string {
	return error instanceof ApiHttpError ? UNEXPECTED_MESSAGE : NETWORK_MESSAGE;
}

/**
 * The household dialog without any UI (boards `M-Household`, `D-Household`, flows 5.4 and 5.5, U5): members, the
 * owner's invitations, rename, removal of a member and leaving. Every request is one method; refusals of the server
 * (the limit of three invitations, `last-owner`, `owner-required`) become messages in the state, never exceptions.
 *
 * It holds the link of a created invitation in the state only until `dismissCreatedInvitation`; nothing else keeps it,
 * and nothing here logs it.
 */
export class HouseholdPanel {
	private current: HouseholdPanelState = { load: 'loading' };
	private isDisposed = false;

	public constructor(private readonly options: HouseholdPanelOptions) {}

	public get state(): HouseholdPanelState {
		return this.current;
	}

	public get isBusy(): boolean {
		return this.current.busy !== undefined;
	}

	/** The household and, for an owner, the active invitations. Also the retry after a failed load. */
	public async load(): Promise<void> {
		this.patch({ load: 'loading', loadError: undefined });

		try {
			const result = await this.options.gateway.household.get();

			if (!result.ok) {
				this.patch({ load: 'failed', loadError: result.message });
				return;
			}

			this.patch({ household: result.household, load: 'ready' });

			if (result.household.role === 'owner') {
				await this.loadInvitations();
			}
		}
		catch {
			this.patch({ load: 'failed', loadError: LOAD_FAILED_MESSAGE });
		}
	}

	/** The active invitations again (after creating or revoking one, or when the list could not be loaded). */
	public async loadInvitations(): Promise<void> {
		try {
			const result = await this.options.gateway.invitations.list();

			if (result.ok) {
				this.patch({ invitations: result.invitations, invitationsError: undefined });
				return;
			}

			this.patch({ invitationsError: result.message });
		}
		catch {
			this.patch({ invitationsError: INVITATIONS_FAILED_MESSAGE });
		}
	}

	public async rename(name: string): Promise<void> {
		const parsed = updateHouseholdInputSchema.safeParse({ name });

		if (!parsed.success) {
			this.patch({ renameError: parsed.error.issues[0]?.message ?? UNEXPECTED_MESSAGE });
			return;
		}

		await this.run({ kind: 'rename' }, { renameError: undefined }, async () => {
			const result = await this.options.gateway.household.rename(parsed.data.name);

			if (result.ok) {
				this.patch({ household: result.household });
				this.options.onRenamed({ id: result.household.id, name: result.household.name, role: result.household.role });
				return;
			}

			this.patch({ renameError: result.fieldErrors?.name ?? result.message });
		}, (message) => ({ renameError: message }));
	}

	/** Creates an invitation and keeps its link in the state, once. A full list (409) is a message, not a failure. */
	public async createInvitation(): Promise<void> {
		await this.run({ kind: 'create-invitation' }, { createdInvitation: undefined, inviteError: undefined }, async () => {
			const result = await this.options.gateway.invitations.create();

			if (result.ok) {
				this.patch({ createdInvitation: result.invitation });
			}
			else {
				this.patch({ inviteError: result.message });
			}

			await this.loadInvitations();
		}, (message) => ({ inviteError: message }));
	}

	/** «Готово» under the created link: the link is gone from the page and cannot be shown again. */
	public dismissCreatedInvitation(): void {
		this.patch({ createdInvitation: undefined });
	}

	public async revokeInvitation(id: string): Promise<void> {
		await this.run({ id, kind: 'revoke' }, { revokeError: undefined }, async () => {
			const result = await this.options.gateway.invitations.revoke(id);

			if (result.ok) {
				this.patch({
					invitations: this.current.invitations?.filter((invitation: ActiveHouseholdInvitation) => invitation.id !== id)
				});
				return;
			}

			// The invitation is gone already (accepted or revoked elsewhere): show the list as it is now.
			this.patch({ revokeError: result.message });
			await this.loadInvitations();
		}, (message) => ({ revokeError: message }));
	}

	public ask(confirmation: HouseholdConfirmation): void {
		if (this.isBusy) {
			return;
		}

		this.patch({ confirmError: undefined, confirmation });
	}

	public cancelConfirmation(): void {
		if (this.isBusy) {
			return;
		}

		this.patch({ confirmError: undefined, confirmation: undefined });
	}

	/** Does what the open confirmation asks: removes the member or leaves the household. */
	public async confirm(): Promise<void> {
		const confirmation = this.current.confirmation;

		if (confirmation === undefined) {
			return;
		}

		if (confirmation.kind === 'leave') {
			await this.run({ kind: 'leave' }, { confirmError: undefined }, async () => {
				const result = await this.options.gateway.household.leave();

				if (result.ok) {
					this.patch({ confirmation: undefined });
					this.options.onLeft();
					return;
				}

				this.patch({ confirmError: result.message });
			}, (message) => ({ confirmError: message }));
			return;
		}

		await this.run({ kind: 'remove', userId: confirmation.member.userId }, { confirmError: undefined }, async () => {
			const result = await this.options.gateway.household.removeMember(confirmation.member.userId);

			if (result.ok) {
				this.patch({ confirmation: undefined, household: result.household });
				return;
			}

			if (result.errorCode === 'member-not-found') {
				// Removed elsewhere meanwhile: the list as it is now is the answer.
				this.patch({ confirmation: undefined });
				await this.reloadHousehold();
				return;
			}

			this.patch({ confirmError: result.message });
		}, (message) => ({ confirmError: message }));
	}

	/** The page is gone: answers that arrive later change nothing in a dead view. */
	public dispose(): void {
		this.isDisposed = true;
	}

	private async reloadHousehold(): Promise<void> {
		try {
			const result = await this.options.gateway.household.get();

			if (result.ok) {
				this.patch({ household: result.household });
			}
		}
		catch {
			// The list stays as it was.
		}
	}

	/**
	 * One request at a time: marks it busy, clears the message it would replace, and turns a thrown error into the
	 * message of the area (`onThrown`). Ignored while another request runs.
	 */
	private async run(
		busy: HouseholdBusy,
		reset: Partial<HouseholdPanelState>,
		action: () => Promise<void>,
		onThrown: (message: string) => Partial<HouseholdPanelState>
	): Promise<void> {
		if (this.isBusy) {
			return;
		}

		this.patch({ ...reset, busy });

		try {
			await action();
		}
		catch (error: unknown) {
			this.patch(onThrown(describeThrown(error)));
		}
		finally {
			this.patch({ busy: undefined });
		}
	}

	private patch(patch: Partial<HouseholdPanelState>): void {
		if (this.isDisposed) {
			return;
		}

		this.current = { ...this.current, ...patch };
		this.options.onChange(this.current);
	}
}

/** The owners of a household other than the person: whether the person may leave without orphaning it. */
export function hasAnotherOwner(household: HouseholdDetails, userId: string): boolean {
	return household.members.some((member) => member.role === 'owner' && member.userId !== userId);
}
