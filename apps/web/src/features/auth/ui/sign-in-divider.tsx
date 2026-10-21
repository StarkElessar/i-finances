import css from './sign-in-divider.module.scss';

/** The «или» line between Telegram and the other ways to sign in (mockup `M-SignIn`, `D-SignIn`). */
export function SignInDivider() {
	return (
		<div class={css.root} role='separator'>
			<span>или</span>
		</div>
	);
}
