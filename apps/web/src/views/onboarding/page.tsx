import css from './onboarding.module.scss';

import { AppLogo, Banner, Button, Typography } from '@/shared/ui';

import { useCurrentViewer } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';

import { HOUSEHOLD_REQUIRED_MESSAGE } from '@i-finances/contracts';
import { Title } from '@solidjs/meta';
import { CircleAlert, Info } from 'lucide-solid';
import { createSignal, Show } from 'solid-js';

export type OnboardingPageProps = {
	authClient: AuthClient;
	onSignedOut: () => void;
};

/**
 * Where a signed-in user without a household lands (Р4): every finance route answers 403 `household-required` for
 * them, so the router never shows those pages. The board `Flow-Onboarding` (name, «Создать своё окружение», «У меня
 * есть приглашение») is task U3; until then this page says where the user stands and lets them sign out.
 */
export function OnboardingPage(props: OnboardingPageProps) {
	const viewer = useCurrentViewer();
	const [isSigningOut, setIsSigningOut] = createSignal(false);
	const [error, setError] = createSignal<string>();

	const handleSignOut = async (): Promise<void> => {
		setError(undefined);
		setIsSigningOut(true);

		try {
			await props.authClient.signOut();
			props.onSignedOut();
		}
		catch {
			setError('Не удалось выйти. Попробуйте ещё раз.');
			setIsSigningOut(false);
		}
	};

	return (
		<div class={css.page}>
			<Title>Добро пожаловать — iFinances</Title>
			<div class={css.card}>
				<AppLogo size='lg'/>
				<div class={css.header}>
					<Typography as='h1' variant='heading-2'>Добро пожаловать</Typography>
					<Show when={viewer()}>
						{(current) => (
							<Typography tone='secondary' variant='body-md'>Вы вошли как {current().displayName}.</Typography>
						)}
					</Show>
				</div>
				<Banner icon={<Info/>} tone='info'>{HOUSEHOLD_REQUIRED_MESSAGE}</Banner>
				<Typography tone='secondary' variant='body-md'>
					Создание окружения и приём приглашения появятся на этом экране в следующем обновлении.
				</Typography>
				<Show when={error()}>
					{(content) => <Banner icon={<CircleAlert/>} role='alert' tone='danger'>{content()}</Banner>}
				</Show>
				<Button fullWidth loading={isSigningOut()} onClick={() => void handleSignOut()} size='lg' variant='secondary'>
					Выйти
				</Button>
			</div>
		</div>
	);
}
