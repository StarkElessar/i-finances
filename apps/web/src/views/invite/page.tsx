import { PageCard } from '@/shared/ui';

import { applyHouseholdChange, resolveViewerAccess, useCurrentViewer, useSetCurrentViewer } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';
import { createSignInMethods, saveDisplayName } from '@/features/auth';
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
import { Navigate, query, useNavigate } from '@solidjs/router';
import { createEffect, createMemo, createSignal, Match, onCleanup, onMount, Switch } from 'solid-js';

export type InvitePageProps = {
	authClient: AuthClient;
	/** The sign-in on the card finished: the app reloads the session and comes back to this page. */
	onSignedIn: () => void;
};

type GuestSignInProps = {
	authClient: AuthClient;
	onSignedIn: () => void;
	preview: Extract<InvitationScreen, { kind: 'guest' }>['preview'];
	token: string | undefined;
};

/** The guest card owns the sign-in controller, so a signed-in person never starts a Telegram request here. */
function GuestSignIn(props: GuestSignInProps) {
	const controller = createSignInMethods(props.authClient, () => handleSignedIn(), props.token);
	const guestController = { ...controller, signOut: () => handleSignOut() };

	const rememberRegistration = (allowUnclaimed = false): void => {
		const state = controller.telegram.state();
		// A restarted sign-in retains the previous session value while the new account is loading.
		const session = controller.isSessionLoading() ? undefined : controller.session();

		if (state.kind !== 'confirmed' || props.token === undefined) {
			return;
		}

		// The complete body may be lost after registration consumed the app invitation and set the session cookie.
		const isRecoveredAppRegistration = state.isRecovered && props.preview.kind === 'app' && !state.hasHousehold;

		if ((state.isNewUser || isRecoveredAppRegistration) && (session?.authenticated || allowUnclaimed)) {
			pendingInvitation.markRegistered(
				props.token,
				props.preview.kind ?? 'household',
				session?.authenticated ? session.user.id : undefined
			);
		}
	};

	const handleSignedIn = (): void => {
		rememberRegistration(true);
		props.onSignedIn();
	};

	const handleSignOut = async (): Promise<void> => {
		const session = controller.session();

		await controller.signOut();
		pendingInvitation.clearRegistration(session?.authenticated ? session.user.id : undefined);

		if (props.token !== undefined) {
			// This guest flow continues with the same invitation; release any binding to the rejected identity.
			pendingInvitation.save(props.token);
		}
	};

	createEffect(() => {
		// Remember the successful registration before the person continues or reloads the identity card.
		rememberRegistration();
	});

	return <InvitationGuestCard controller={guestController} preview={props.preview}/>;
}

/**
 * `/invite`: the page of an invitation link `/invite#<token>` (boards `Flow-Invite`, flow 5.4, U4). It serves every
 * viewer: a guest sees who invites them and signs in on the card, a person without a household or with an empty one
 * accepts, a member is told they are already in a household.
 *
 * The token is taken out of the address at app start (`installInvitationAddressClaim` in `main.tsx`, before the session
 * check) and only through `readInvitationTokenFromLocation`, moved to `sessionStorage`, and the address is replaced with
 * `/invite`, so the token stays neither in the address bar nor in the history entry; the claim here only repeats it.
 * After a sign-in the session reload rebuilds this page; the token comes back from `sessionStorage`, for this user only.
 */
export function InvitePage(props: InvitePageProps) {
	const viewer = useCurrentViewer();
	const setCurrentViewer = useSetCurrentViewer();
	const navigate = useNavigate();
	const [state, setState] = createSignal<InvitationFlowState>({ kind: 'loading' });
	const [displayName, setDisplayName] = createSignal(viewer()?.displayName ?? '');
	const [nameError, setNameError] = createSignal<string>();
	const [saveNameError, setSaveNameError] = createSignal<string>();
	const [isSavingName, setIsSavingName] = createSignal(false);
	const flow = new InvitationFlow({
		gateway: new InvitationClient(),
		onAccepted: (household) => applyHouseholdChange(household, { clearCache: () => query.clear(), setCurrentViewer }),
		onChange: setState,
		store: pendingInvitation
	});
	const registrationKind = () => pendingInvitation.registrationKind(viewer()?.id);
	const screen = createMemo(() => describeInvitationScreen(state(), resolveViewerAccess(viewer()) !== 'anonymous', registrationKind()));
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

	const handleAccept = async (): Promise<void> => {
		if (isSavingName()) {
			return;
		}

		setSaveNameError(undefined);

		if (registrationKind() === 'household') {
			setNameError(undefined);
			setIsSavingName(true);

			try {
				const outcome = await saveDisplayName(props.authClient, displayName(), viewer()?.displayName);

				if (outcome.kind === 'invalid-name') {
					setNameError(outcome.message);
					return;
				}

				if (outcome.kind === 'failed') {
					setSaveNameError(outcome.message);
					return;
				}

				setCurrentViewer({ displayName: outcome.displayName });
			}
			finally {
				setIsSavingName(false);
			}
		}

		await flow.accept(false);
	};

	onMount(() => {
		if (screen().kind !== 'create-household') {
			void flow.load(token);
		}
	});
	onCleanup(() => flow.dispose());

	return (
		<PageCard>
			<Title>Приглашение — iFinances</Title>
			<Switch>
				<Match when={screenOf('create-household')()}>
					<Navigate href='/onboarding'/>
				</Match>
				<Match when={screenOf('already-registered')()}>
					<InvitationAlreadyCard invitationKind='app' onDismiss={handleDismiss}/>
				</Match>
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
					{(guest) => (
						<GuestSignIn authClient={props.authClient} onSignedIn={props.onSignedIn} preview={guest().preview} token={token}/>
					)}
				</Match>
				<Match when={screenOf('confirm')()}>
					{(confirm) => (
						<InvitationConfirmCard
							isAccepting={confirm().isAccepting || isSavingName()}
							newAccount={registrationKind() === 'household' ? {
								displayName: displayName(),
								error: nameError(),
								onInput: setDisplayName
							} : undefined}
							onAccept={() => void handleAccept()}
							onCancel={handleDismiss}
							preview={confirm().preview}
							problem={saveNameError() ? { kind: 'unexpected', message: saveNameError() ?? '' } : confirm().problem}
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
