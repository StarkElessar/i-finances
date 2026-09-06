import { SignInForm } from '@/features/auth';

import { AppShell } from '@/widgets/app-shell';

import { AccountsPage } from '@/pages/accounts/page';
import { CategoriesPage } from '@/views/categories/page';
import { ContactsPage } from '@/views/contacts/page';
import { HomePage } from '@/pages/home/page';
import { ReceiptsPage } from '@/views/receipts/page';

import type { AppServices } from '@/app/app-services';

import type { CurrentSessionResponse } from '@i-finances/contracts';
import { Navigate, Route, Router } from '@solidjs/router';
import type { Accessor, JSX } from 'solid-js';
import { createResource, Show } from 'solid-js';

type SessionGateProps = {
	children: (session: CurrentSessionResponse) => JSX.Element;
	error: Accessor<unknown>;
	isLoading: Accessor<boolean>;
	session: Accessor<CurrentSessionResponse | undefined>;
};

function SessionGate(props: SessionGateProps) {
	return (
		<Show when={!props.isLoading()} fallback={<p role='status'>Проверяем сессию…</p>}>
			<Show
				fallback={<p role='alert'>{props.error() ? 'Не удалось проверить сессию.' : 'Сессия не найдена.'}</p>}
				when={props.session()}
			>
				{(session) => props.children(session())}
			</Show>
		</Show>
	);
}

type ProtectedRouteProps = AppServices & {
	children: JSX.Element;
	onSignedOut: () => void;
	session: CurrentSessionResponse | undefined;
};

function ProtectedRoute(props: ProtectedRouteProps) {
	const session = props.session;

	if (session === undefined || !session.authenticated) {
		return <Navigate href='/sign-in'/>;
	}

	return (
		<AppShell
			onSignedOut={props.onSignedOut}
			session={session}
			services={{ authClient: props.authClient }}
		>
			{props.children}
		</AppShell>
	);
}

export function AppRouter(props: AppServices) {
	const [session, { refetch }] = createResource(() => props.authClient.currentSession());

	const protectedPage = (children: JSX.Element) => (
		<SessionGate
			error={() => session.error}
			isLoading={() => session.loading}
			session={() => session()}
		>
			{(currentSession) => (
				<ProtectedRoute {...props} onSignedOut={refetch} session={currentSession}>
					{children}
				</ProtectedRoute>
			)}
		</SessionGate>
	);

	return (
		<Router>
			<Route
				path='/sign-in'
				component={() => (
					<SessionGate error={() => session.error} isLoading={() => session.loading} session={() => session()}>
						{(currentSession) => currentSession.authenticated
							? <Navigate href='/'/>
							: <SignInForm client={props.authClient} onSignedIn={refetch}/>
						}
					</SessionGate>
				)}
			/>
			<Route
				path='/'
				component={() => protectedPage(
					<HomePage
						accountClient={props.accountClient}
						categoryClient={props.categoryClient}
						contactClient={props.contactClient}
						operationClient={props.operationClient}
					/>
				)}
			/>
			<Route path='/accounts' component={() => protectedPage(<AccountsPage accountClient={props.accountClient}/>)}/>
			<Route path='/categories' component={() => protectedPage(<CategoriesPage/>)}/>
			<Route path='/contacts' component={() => protectedPage(<ContactsPage/>)}/>
			<Route path='/receipts' component={() => protectedPage(<ReceiptsPage/>)}/>
			<Route path='*404' component={() => <Navigate href='/'/>}/>
		</Router>
	);
}
