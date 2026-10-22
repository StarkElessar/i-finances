import css from './router.module.scss';

import { CurrentViewerProvider, householdLossNotice, viewerFromSession } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';
import { SignInForm } from '@/features/auth';
import { pendingInvitation } from '@/features/invitation';

import { AppHeader } from '@/widgets/app-header';

import { CategoriesPage } from '@/views/categories/page';
import { ContactsPage } from '@/views/contacts/page';
import { HomePage } from '@/views/home/page';
import { InvitePage } from '@/views/invite/page';
import { OnboardingPage } from '@/views/onboarding/page';
import { ReceiptsPage } from '@/views/receipts/page';
import { StatisticsPage } from '@/views/statistics/page';

import type { CurrentSessionResponse } from '@i-finances/contracts';
import type { RouteSectionProps } from '@solidjs/router';
import { Navigate, query, Route, Router } from '@solidjs/router';
import type { Accessor, JSX } from 'solid-js';
import { createResource, onMount, Show } from 'solid-js';

import { AccessFailureListener } from './access/access-failure-listener';
import { AccessGuard } from './access/access-guard';
import { forgetSignedOutUser } from './access/forget-signed-out-user';

export type AppRouterProps = {
	authClient: AuthClient;
};

type SessionGateProps = {
	children: (session: CurrentSessionResponse) => JSX.Element;
	error: Accessor<unknown>;
	isLoading: Accessor<boolean>;
	session: Accessor<CurrentSessionResponse | undefined>;
};

function SessionGate(props: SessionGateProps) {
	return (
		<Show
			fallback={(
				<div aria-busy='true' class={css.sessionGate} role='status'>
					<span aria-hidden='true' class={css.spinner}/>
					<span class={css.status}>Проверяем сессию…</span>
				</div>
			)}
			when={!props.isLoading()}
		>
			<Show
				fallback={<p role='alert'>{props.error() ? 'Не удалось проверить сессию.' : 'Сессия не найдена.'}</p>}
				when={props.session()}
			>
				{(session) => props.children(session())}
			</Show>
		</Show>
	);
}

type MemberLayoutProps = RouteSectionProps & {
	authClient: AuthClient;
	onSignedOut: () => void;
};

/**
 * The shell of the finance pages. It stays mounted while the member moves between them, so the header keeps its state.
 */
function MemberLayout(props: MemberLayoutProps) {
	// A member is in a household: the notice «Вы больше не участник…» of an earlier loss is out of date.
	onMount(() => householdLossNotice.clear());

	return (
		<AccessGuard access='member'>
			<AppHeader authClient={props.authClient} onSignedOut={props.onSignedOut}/>
			{props.children}
		</AccessGuard>
	);
}

export function AppRouter(props: AppRouterProps) {
	const [session, { refetch }] = createResource(() => props.authClient.currentSession());

	/**
	 * A different user (or nobody) from now on: sign-in and sign-out. The whole tree under the session gate is rebuilt
	 * on purpose, and cached query results of the previous user are dropped, so back and forward cannot show them.
	 * Changes of the same user (display name, household) patch the viewer instead (`useSetCurrentViewer`).
	 */
	const reloadSession = (): void => {
		query.clear();
		void refetch();
	};

	/**
	 * An explicit sign-out: the invitation waiting in the tab belonged to the person who leaves, so the next one to sign
	 * in here must not get it (review of U4); the same for the notice about a lost household.
	 */
	const handleSignedOut = (): void => {
		forgetSignedOutUser({ householdLossNotice, pendingInvitation });
		reloadSession();
	};

	const root = (rootProps: RouteSectionProps) => (
		<SessionGate error={() => session.error} isLoading={() => session.loading} session={() => session()}>
			{(currentSession) => (
				<CurrentViewerProvider initialViewer={viewerFromSession(currentSession)}>
					<AccessFailureListener/>
					{rootProps.children}
				</CurrentViewerProvider>
			)}
		</SessionGate>
	);

	return (
		<Router root={root}>
			<Route
				path='/sign-in'
				component={() => (
					<AccessGuard access='anonymous'>
						<SignInForm client={props.authClient} onSignedIn={reloadSession}/>
					</AccessGuard>
				)}
			/>
			<Route
				path='/onboarding'
				component={() => (
					<AccessGuard access='onboarding'>
						<OnboardingPage authClient={props.authClient} onSignedOut={handleSignedOut}/>
					</AccessGuard>
				)}
			/>
			<Route
				path='/invite'
				component={() => (
					<AccessGuard access='any'>
						<InvitePage authClient={props.authClient} onSignedIn={reloadSession}/>
					</AccessGuard>
				)}
			/>
			<Route
				path='/'
				component={(layoutProps) => <MemberLayout {...layoutProps} authClient={props.authClient} onSignedOut={handleSignedOut}/>}
			>
				<Route path='/' component={HomePage}/>
				<Route path='/categories' component={CategoriesPage}/>
				<Route path='/contacts' component={ContactsPage}/>
				<Route path='/receipts' component={ReceiptsPage}/>
				<Route path='/stats' component={StatisticsPage}/>
			</Route>
			<Route path='*404' component={() => <Navigate href='/'/>}/>
		</Router>
	);
}
