import { ApiHttpError } from '@/shared/api';

import type {
	AcceptInvitationResult,
	HouseholdInvitationFailure,
	HouseholdSummary,
	InvitationPreview,
	InvitationPreviewResult
} from '@i-finances/contracts';

import type {
	InvitationFlowState,
	InvitationRequestProblem,
	InvitationUnavailableCause,
	OwnEmptyHousehold
} from './invitation-state';
import type { PendingInvitationStore } from './pending-invitation-store';

export type InvitationGateway = {
	accept: (token: string, replaceEmptyHousehold: boolean) => Promise<AcceptInvitationResult>;
	preview: (token: string) => Promise<InvitationPreviewResult>;
};

export type InvitationFlowOptions = {
	gateway: InvitationGateway;
	/** Called once, when the person has joined: the caller patches the viewer (household, role `member`). */
	onAccepted: (household: HouseholdSummary) => void;
	onChange: (state: InvitationFlowState) => void;
	store: PendingInvitationStore;
};

export const PREVIEW_NETWORK_MESSAGE = 'Не удалось загрузить приглашение. Проверьте соединение и повторите.';

export const ACCEPT_NETWORK_MESSAGE = 'Не удалось присоединиться. Проверьте соединение и повторите.';

const UNEXPECTED_MESSAGE = 'Не удалось выполнить действие. Попробуйте ещё раз.';

/** The answers that say «this token opens nothing»; `invitation-not-found` is the older shape of the same. */
function readUnavailableCause(failure: HouseholdInvitationFailure): InvitationUnavailableCause | undefined {
	if (failure.errorCode === 'invitation-unavailable' || failure.errorCode === 'invitation-not-found') {
		return failure.reason ?? 'unspecified';
	}

	return failure.errorCode === 'invalid-input' ? 'malformed' : undefined;
}

function readProblem(failure: HouseholdInvitationFailure): InvitationRequestProblem {
	return failure.errorCode === 'rate-limited' ? 'rate-limited' : 'unexpected';
}

function readFailureMessage(failure: HouseholdInvitationFailure): string {
	return failure.message === '' ? UNEXPECTED_MESSAGE : failure.message;
}

/**
 * The invitation page without any UI (flow 5.4): previews the token, accepts it, and walks the states of the boards
 * `Flow-Invite`. It holds the token only as a private field and in the store, and never reports it: states, messages
 * and thrown errors carry no token.
 *
 * Forgetting rules: the stored token is cleared when the link is found dead, when the person has joined and when the
 * person dismisses the page; it stays through network problems, too many requests and the refusal «вы уже в
 * окружении», so the person can come back to it.
 */
export class InvitationFlow {
	private token: string | undefined;
	private isDisposed = false;
	private current: InvitationFlowState = { kind: 'loading' };

	public constructor(private readonly options: InvitationFlowOptions) {}

	public get state(): InvitationFlowState {
		return this.current;
	}

	/** Previews the invitation. `undefined` means the page has no token at all: the link was cut or never pasted. */
	public async load(token: string | undefined): Promise<void> {
		this.token = token;

		if (token === undefined) {
			this.setUnavailable('malformed');
			return;
		}

		this.setState({ kind: 'loading' });

		try {
			this.applyPreview(await this.options.gateway.preview(token));
		}
		catch (error: unknown) {
			this.applyPreviewError(error);
		}
	}

	/** Repeats the preview after a problem. */
	public retry(): Promise<void> {
		return this.load(this.token);
	}

	/**
	 * «Присоединиться» (`false`) or the consent «Удалить «Дом» и присоединиться» (`true`). Does nothing unless the page
	 * waits for the person's decision.
	 */
	public async accept(replaceEmptyHousehold: boolean): Promise<void> {
		const token = this.token;
		const state = this.current;

		if (token === undefined || (state.kind !== 'ready' && state.kind !== 'accept-failed' && state.kind !== 'confirm-replace')) {
			return;
		}

		const { preview } = state;
		const replacing = replaceEmptyHousehold && state.kind === 'confirm-replace'
			? { currentHouseholdName: state.currentHouseholdName }
			: undefined;

		this.setState({ kind: 'accepting', preview, replacing });

		try {
			this.applyAccept(await this.options.gateway.accept(token, replaceEmptyHousehold), preview, replacing);
		}
		catch (error: unknown) {
			const isServerError = error instanceof ApiHttpError;

			this.setAcceptFailed(
				preview,
				replacing,
				isServerError ? UNEXPECTED_MESSAGE : ACCEPT_NETWORK_MESSAGE,
				isServerError ? 'unexpected' : 'network'
			);
		}
	}

	/** «Отмена», «Понятно»: the person leaves the invitation, the token is forgotten. */
	public dismiss(): void {
		this.token = undefined;
		this.options.store.clear();
	}

	/** The page is gone: answers that arrive later change nothing. */
	public dispose(): void {
		this.isDisposed = true;
	}

	private applyPreview(result: InvitationPreviewResult): void {
		if (result.ok) {
			this.setState({ kind: 'ready', preview: result.invitation });
			return;
		}

		const cause = readUnavailableCause(result);

		if (cause !== undefined) {
			this.setUnavailable(cause);
			return;
		}

		this.setState({ kind: 'preview-failed', message: readFailureMessage(result), problem: readProblem(result) });
	}

	private applyPreviewError(error: unknown): void {
		const isServerError = error instanceof ApiHttpError;

		this.setState({
			kind: 'preview-failed',
			message: isServerError ? UNEXPECTED_MESSAGE : PREVIEW_NETWORK_MESSAGE,
			problem: isServerError ? 'unexpected' : 'network'
		});
	}

	private applyAccept(result: AcceptInvitationResult, preview: InvitationPreview, replacing: OwnEmptyHousehold | undefined): void {
		if (result.ok) {
			this.token = undefined;
			this.options.store.clear();
			this.setState({ household: result.household, kind: 'accepted' });
			this.options.onAccepted(result.household);
			return;
		}

		const cause = readUnavailableCause(result);

		if (cause !== undefined) {
			this.setUnavailable(cause);
			return;
		}

		switch (result.errorCode) {
			case 'already-in-household':
				this.setState({ currentHouseholdName: result.currentHousehold?.name, kind: 'already-in-household', preview });
				return;

			case 'empty-household-confirmation-required':
				this.setState({ currentHouseholdName: result.currentHousehold?.name, kind: 'confirm-replace', preview });
				return;

			case 'unauthenticated':
				// The session is gone; the viewer is cleared by the access listener and the page shows the sign-in again.
				this.setState({ kind: 'ready', preview });
				return;

			default:
				this.setAcceptFailed(preview, replacing, readFailureMessage(result), readProblem(result));
		}
	}

	/** After a consent the person stays on the consent card with the error under it; otherwise on the confirm card (7). */
	private setAcceptFailed(
		preview: InvitationPreview,
		replacing: OwnEmptyHousehold | undefined,
		message: string,
		problem: InvitationRequestProblem
	): void {
		if (replacing === undefined) {
			this.setState({ kind: 'accept-failed', message, preview, problem });
			return;
		}

		this.setState({ currentHouseholdName: replacing.currentHouseholdName, error: message, kind: 'confirm-replace', preview });
	}

	private setUnavailable(cause: InvitationUnavailableCause): void {
		this.token = undefined;
		this.options.store.clear();
		this.setState({ cause, kind: 'unavailable' });
	}

	private setState(state: InvitationFlowState): void {
		if (this.isDisposed) {
			return;
		}

		this.current = state;
		this.options.onChange(state);
	}
}
