import type { HouseholdSummary } from '@i-finances/contracts';

/** The linked Telegram account; `username` is the Telegram name without `@`, `null` when the person has none. */
export type ViewerTelegram = {
	username: string | null;
};

/**
 * Minimal authenticated user snapshot safe for client UI.
 */
export type CurrentViewer = {
	/**
	 * May found a household (`canCreateHousehold` of the session; `false` when the session does not say): only then
	 * the onboarding offers «Создать своё окружение». Others join a household by an invitation.
	 */
	canCreateHousehold: boolean;
	displayName: string;
	/** `false` for an account created through Telegram: the password block of «Безопасность» has nothing to change. */
	hasPassword: boolean;
	/** `null` while the user has no household (onboarding); every household route answers 403 then. */
	household: HouseholdSummary | null;
	id: string;
	/** Only the explicit session flag grants access to application invitations. */
	isPlatformAdmin: boolean;
	/** The linked Telegram account, `null` while there is none. Patched in place when a link is made. */
	telegram: ViewerTelegram | null;
	username: string;
};
