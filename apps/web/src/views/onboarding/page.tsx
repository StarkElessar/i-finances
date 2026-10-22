import { PageCard } from '@/shared/ui';

import { householdLossNotice, useCurrentViewer, useSetCurrentViewer } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';
import {
	createHousehold,
	DEFAULT_HOUSEHOLD_NAME,
	HouseholdClient,
	OnboardingCreateCard,
	OnboardingWelcomeCard,
	readWelcomeForm,
	type WelcomeChoice
} from '@/features/household';
import { parseInvitationLink, pendingInvitation } from '@/features/invitation';

import { INVITATION_PAGE_PATH } from '@i-finances/contracts';
import { Title } from '@solidjs/meta';
import { useNavigate } from '@solidjs/router';
import { createSignal, Match, Switch } from 'solid-js';

export type OnboardingPageProps = {
	authClient: AuthClient;
	onSignedOut: () => void;
};

type Step = 'create' | 'welcome';

const SAVE_NAME_FAILED_MESSAGE = 'Не удалось сохранить имя. Попробуйте ещё раз.';

const SIGN_OUT_FAILED_MESSAGE = 'Не удалось выйти. Попробуйте ещё раз.';

/**
 * `/onboarding`: where a signed-in user without a household lands (Р4, boards `Flow-Onboarding`, U3). Every finance
 * route answers 403 `household-required` for them, so the router never shows those pages.
 *
 * Step 1 confirms the name and chooses between creating a household and accepting an invitation; step 2 names the new
 * household. After the creation the viewer is patched in place (household, role `owner`), never by reloading the
 * session (memory `viewer-refetch-remount-bug`), and the person lands on the empty home.
 */
export function OnboardingPage(props: OnboardingPageProps) {
	const viewer = useCurrentViewer();
	const setCurrentViewer = useSetCurrentViewer();
	const navigate = useNavigate();
	const householdClient = new HouseholdClient();
	const lostHouseholdName = householdLossNotice.read();
	const [step, setStep] = createSignal<Step>('welcome');
	const [displayName, setDisplayName] = createSignal(viewer()?.displayName ?? '');
	const [isNameTouched, setIsNameTouched] = createSignal(false);
	const [choice, setChoice] = createSignal<WelcomeChoice>('create');
	const [link, setLink] = createSignal('');
	const [welcomeError, setWelcomeError] = createSignal<string>();
	const [householdName, setHouseholdName] = createSignal(DEFAULT_HOUSEHOLD_NAME);
	const [householdNameError, setHouseholdNameError] = createSignal<string>();
	const [createError, setCreateError] = createSignal<string>();
	const [isSubmitting, setIsSubmitting] = createSignal(false);

	const form = () => readWelcomeForm({ choice: choice(), displayName: displayName(), link: link() }, parseInvitationLink);

	/** Saves the name when it changed; false when it could not be saved (the message is already shown). */
	const confirmDisplayName = async (name: string): Promise<boolean> => {
		if (name === (viewer()?.displayName ?? '')) {
			return true;
		}

		try {
			const result = await props.authClient.updateDisplayName(name);

			if (result.ok) {
				setCurrentViewer({ displayName: result.displayName });
				return true;
			}

			setWelcomeError(result.message);
		}
		catch {
			setWelcomeError(SAVE_NAME_FAILED_MESSAGE);
		}

		return false;
	};

	const handleContinue = async (): Promise<void> => {
		const current = form();

		setIsNameTouched(true);
		setWelcomeError(undefined);

		if (!current.canContinue) {
			return;
		}

		setIsSubmitting(true);

		try {
			if (!await confirmDisplayName(current.displayName)) {
				return;
			}

			if (current.token === undefined) {
				setStep('create');
				return;
			}

			// The invitation page takes the token from the store; the address stays clean.
			pendingInvitation.save(current.token, viewer()?.id);
			navigate(INVITATION_PAGE_PATH);
		}
		finally {
			setIsSubmitting(false);
		}
	};

	/** Somebody put the person into a household meanwhile (another tab, an invitation): take it from the session. */
	const adoptHouseholdOfSession = async (): Promise<void> => {
		try {
			const session = await props.authClient.currentSession();

			if (session.authenticated && session.household !== null) {
				setCurrentViewer({ household: session.household });
				return;
			}
		}
		catch {
			// The session could not be read: the message below stays.
		}

		setCreateError('Не удалось создать окружение. Обновите страницу и попробуйте ещё раз.');
	};

	const handleCreate = async (): Promise<void> => {
		setHouseholdNameError(undefined);
		setCreateError(undefined);
		setIsSubmitting(true);

		try {
			const outcome = await createHousehold(householdClient, householdName());

			switch (outcome.kind) {
				case 'created':
					householdLossNotice.clear();
					setCurrentViewer({ household: outcome.household });
					navigate('/', { replace: true });
					return;

				case 'already-in-household':
					await adoptHouseholdOfSession();
					return;

				case 'invalid-name':
					setHouseholdNameError(outcome.message);
					return;

				case 'failed':
					setCreateError(outcome.message);
			}
		}
		finally {
			setIsSubmitting(false);
		}
	};

	const handleSignOut = async (): Promise<void> => {
		setWelcomeError(undefined);
		setIsSubmitting(true);

		try {
			await props.authClient.signOut();
			props.onSignedOut();
		}
		catch {
			setWelcomeError(SIGN_OUT_FAILED_MESSAGE);
			setIsSubmitting(false);
		}
	};

	return (
		<PageCard>
			<Title>Добро пожаловать — iFinances</Title>
			<Switch>
				<Match when={step() === 'welcome'}>
					<OnboardingWelcomeCard
						canContinue={form().canContinue}
						choice={choice()}
						displayName={displayName()}
						displayNameError={isNameTouched() ? form().displayNameError : undefined}
						error={welcomeError()}
						isSubmitting={isSubmitting()}
						link={link()}
						linkError={form().linkError}
						lostHouseholdName={lostHouseholdName}
						onChoice={setChoice}
						onContinue={() => void handleContinue()}
						onDisplayNameInput={(value) => {
							setIsNameTouched(true);
							setDisplayName(value);
						}}
						onLinkInput={setLink}
						onSignOut={() => void handleSignOut()}
					/>
				</Match>
				<Match when={step() === 'create'}>
					<OnboardingCreateCard
						error={createError()}
						isSubmitting={isSubmitting()}
						name={householdName()}
						nameError={householdNameError()}
						onBack={() => {
							setCreateError(undefined);
							setStep('welcome');
						}}
						onNameInput={setHouseholdName}
						onSubmit={() => void handleCreate()}
					/>
				</Match>
			</Switch>
		</PageCard>
	);
}
