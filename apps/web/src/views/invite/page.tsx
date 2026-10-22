import { PageCard } from '@/shared/ui';

import { resolveViewerAccess, useCurrentViewer, useSetCurrentViewer } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';
import { createSignInMethods } from '@/features/auth';
import {
	claimInvitationTokenFromAddress,
	describeInvitationScreen,
	InvitationAcceptedCard,
	InvitationAlreadyCard,
	InvitationClient,
	InvitationConfirmCard,
	InvitationFlow,
	type InvitationFlowState,
	InvitationGuestCard,
	InvitationLoadingCard,
	InvitationReplaceCard,
	type InvitationScreen,
	InvitationUnavailableCard,
	pendingInvitation
} from '@/features/invitation';

import { Title } from '@solidjs/meta';
import { useNavigate } from '@solidjs/router';
import { createMemo, createSignal, Match, onCleanup, onMount, Switch } from 'solid-js';

export type InvitePageProps = {
	authClient: AuthClient;
	/** The sign-in on the card finished: the app reloads the session and comes back to this page. */
	onSignedIn: () => void;
};

type GuestSignInProps = {
	authClient: AuthClient;
	onSignedIn: () => void;
	preview: Extract<InvitationScreen, { kind: 'guest' }>['preview'];
};

/** The guest card owns the sign-in controller, so a signed-in person never starts a Telegram request here. */
function GuestSignIn(props: GuestSignInProps) {
	const controller = createSignInMethods(props.authClient, () => props.onSignedIn());

	return <InvitationGuestCard controller={controller} preview={props.preview}/>;
}

/**
 * `/invite`: the page of an invitation link `/invite#<token>` (boards `Flow-Invite`, flow 5.4, U4). It serves every
 * viewer: a guest sees who invites them and signs in on the card, a person without a household or with an empty one
 * accepts, a member is told they are already in a household.
 *
 * The token is read from the address once and only through `readInvitationTokenFromLocation`, moved to `sessionStorage`
 * and the address is replaced with `/invite` at once, so the token stays neither in the address bar nor in the history
 * entry. After a sign-in the session reload rebuilds this page; the token comes back from `sessionStorage`.
 */
export function InvitePage(props: InvitePageProps) {
	const viewer = useCurrentViewer();
	const setCurrentViewer = useSetCurrentViewer();
	const navigate = useNavigate();
	const [state, setState] = createSignal<InvitationFlowState>({ kind: 'loading' });
	const flow = new InvitationFlow({
		gateway: new InvitationClient(),
		onAccepted: (household) => setCurrentViewer({ household }),
		onChange: setState,
		store: pendingInvitation
	});
	const screen = createMemo(() => describeInvitationScreen(state(), resolveViewerAccess(viewer()) !== 'anonymous'));
	const screenOf = <TKind extends InvitationScreen['kind']>(kind: TKind) => () => {
		const current = screen();

		return current.kind === kind ? current as Extract<InvitationScreen, { kind: TKind }> : undefined;
	};

	const token = claimInvitationTokenFromAddress({
		location: window.location,
		replaceAddress: (path) => window.history.replaceState(window.history.state, '', path),
		store: pendingInvitation
	}) ?? pendingInvitation.read(viewer()?.id);

	const goHome = (): void => {
		navigate('/', { replace: true });
	};

	const handleDismiss = (): void => {
		flow.dismiss();
		goHome();
	};

	onMount(() => {
		void flow.load(token);
	});
	onCleanup(() => flow.dispose());

	return (
		<PageCard>
			<Title>Приглашение — iFinances</Title>
			<Switch>
				<Match when={screenOf('loading')()}>
					<InvitationLoadingCard onCancel={handleDismiss} onRetry={() => void flow.retry()}/>
				</Match>
				<Match when={screenOf('preview-failed')()}>
					{(failed) => (
						<InvitationLoadingCard
							onCancel={handleDismiss}
							onRetry={() => void flow.retry()}
							problem={{ kind: failed().problem, message: failed().message }}
						/>
					)}
				</Match>
				<Match when={screenOf('unavailable')()}>
					{(unavailable) => <InvitationUnavailableCard cause={unavailable().cause} onDismiss={goHome}/>}
				</Match>
				<Match when={screenOf('guest')()}>
					{(guest) => <GuestSignIn authClient={props.authClient} onSignedIn={props.onSignedIn} preview={guest().preview}/>}
				</Match>
				<Match when={screenOf('confirm')()}>
					{(confirm) => (
						<InvitationConfirmCard
							isAccepting={confirm().isAccepting}
							onAccept={() => void flow.accept(false)}
							onCancel={handleDismiss}
							preview={confirm().preview}
							problem={confirm().problem}
						/>
					)}
				</Match>
				<Match when={screenOf('replace')()}>
					{(replace) => (
						<InvitationReplaceCard
							currentHouseholdName={replace().currentHouseholdName}
							error={replace().error}
							isAccepting={replace().isAccepting}
							onCancel={handleDismiss}
							onConfirm={() => void flow.accept(true)}
							preview={replace().preview}
						/>
					)}
				</Match>
				<Match when={screenOf('already-in-household')()}>
					{(already) => <InvitationAlreadyCard currentHouseholdName={already().currentHouseholdName} onDismiss={handleDismiss}/>}
				</Match>
				<Match when={screenOf('accepted')()}>
					{(accepted) => (
						<InvitationAcceptedCard
							displayName={viewer()?.displayName}
							householdName={accepted().household.name}
							onOpen={goHome}
						/>
					)}
				</Match>
			</Switch>
		</PageCard>
	);
}
