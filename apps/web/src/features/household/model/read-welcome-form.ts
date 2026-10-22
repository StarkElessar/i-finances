import { updateDisplayNameInputSchema } from '@i-finances/contracts';

export type WelcomeChoice = 'create' | 'invite';

export type WelcomeFormInput = {
	choice: WelcomeChoice;
	displayName: string;
	/** What the person pasted into «Ссылка-приглашение»; only read for the choice `invite`. */
	link: string;
};

export type WelcomeForm = {
	/** «Продолжить» is enabled. */
	canContinue: boolean;
	/** The name to save, trimmed. */
	displayName: string;
	displayNameError?: string;
	/** «Это не похоже на приглашение…»: only for a link that was typed in and is wrong, not for an empty field. */
	linkError?: string;
	/** The invitation token of the pasted link, for the choice `invite`. */
	token?: string;
};

export const NOT_AN_INVITATION_MESSAGE = 'Это не похоже на приглашение. Скопируйте ссылку целиком';

/**
 * The first onboarding card (board `Flow-Onboarding`, cards 1–3): the name to confirm and the choice between creating a
 * household and accepting an invitation. «Продолжить» stays disabled while the name is empty or, for the invitation,
 * while the link holds no token. `parseLink` is `parseInvitationLink` (passed in so this module stays free of the
 * invitation feature).
 */
export function readWelcomeForm(input: WelcomeFormInput, parseLink: (text: string) => string | undefined): WelcomeForm {
	const parsedName = updateDisplayNameInputSchema.safeParse({ displayName: input.displayName });
	const displayNameError = parsedName.success ? undefined : parsedName.error.issues[0]?.message;
	const displayName = input.displayName.trim();

	if (input.choice === 'create') {
		return { canContinue: displayNameError === undefined, displayName, displayNameError };
	}

	const hasLink = input.link.trim() !== '';
	const token = hasLink ? parseLink(input.link) : undefined;

	return {
		canContinue: displayNameError === undefined && token !== undefined,
		displayName,
		displayNameError,
		linkError: hasLink && token === undefined ? NOT_AN_INVITATION_MESSAGE : undefined,
		token
	};
}
