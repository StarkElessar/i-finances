import css from './sign-in-card.module.scss';

import { Banner, Button, Typography } from '@/shared/ui';

import type { CurrentSessionResponse } from '@i-finances/contracts';
import { CircleCheck } from 'lucide-solid';
import { createSignal, Show } from 'solid-js';

export type SignedInIdentityView = {
	displayName: string;
	telegramUsername: string | null;
};

export type SignedInIdentityProps = {
	/** `undefined` while the session is loading or when it could not be read: the card still lets the person go on. */
	identity?: SignedInIdentityView;
	isLoading?: boolean;
	onContinue: () => void;
	/** «Это не я, выйти»: ends this session; the caller starts a new sign-in. */
	onSignOut: () => Promise<void>;
};

export function readSignedInIdentity(session: CurrentSessionResponse | undefined): SignedInIdentityView | undefined {
	if (session === undefined || !session.authenticated) {
		return undefined;
	}

	return {
		displayName: session.user.displayName,
		telegramUsername: session.telegram?.username ?? null
	};
}

/**
 * The card after a Telegram sign-in: who the browser is now signed in as, before anything else happens. A sign-in
 * confirmed in someone else's Telegram (a phishing link, a code of another browser) would otherwise sign this
 * browser in silently; the name and the `@username` make it visible (review of Р11).
 */
export function SignedInIdentity(props: SignedInIdentityProps) {
	const [isSigningOut, setIsSigningOut] = createSignal(false);
	const [error, setError] = createSignal<string>();

	const handleSignOut = async (): Promise<void> => {
		setError(undefined);
		setIsSigningOut(true);

		try {
			await props.onSignOut();
		}
		catch {
			setError('Не удалось выйти. Попробуйте ещё раз.');
		}
		finally {
			setIsSigningOut(false);
		}
	};

	return (
		<div class={css.root}>
			<div class={css.header}>
				<Typography as='h2' variant='heading-2'>Вход выполнен</Typography>
			</div>
			<Show
				fallback={(
					<Banner icon={<CircleCheck/>} role='status' tone='success'>
						{props.isLoading ? 'Проверяем аккаунт…' : 'Вы вошли через Telegram.'}
					</Banner>
				)}
				when={props.identity}
			>
				{(identity) => (
					<Banner
						icon={<CircleCheck/>}
						role='status'
						title={`Вы вошли как ${identity().displayName}${identity().telegramUsername ? ',' : '.'}`}
						tone='success'
					>
						{identity().telegramUsername ? `@${identity().telegramUsername}` : undefined}
					</Banner>
				)}
			</Show>
			<Typography tone='secondary' variant='body-md'>
				Если это не ваш аккаунт, выйдите и начните вход заново.
			</Typography>
			<Show when={error()}>{(content) => <Banner role='alert' tone='danger'>{content()}</Banner>}</Show>
			<Button disabled={isSigningOut()} fullWidth loading={props.isLoading} onClick={() => props.onContinue()} size='lg'>
				Продолжить
			</Button>
			<Button fullWidth loading={isSigningOut()} onClick={() => void handleSignOut()} size='lg' variant='ghost'>
				Это не я, выйти
			</Button>
		</div>
	);
}
