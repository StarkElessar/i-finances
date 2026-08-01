import css from './identity-badge.module.scss';

/**
 * Renders the compact identity mark shared by sign-in methods.
 */
export function IdentityBadge() {
	return <div aria-hidden='true' class={css.root}>ID</div>;
}
