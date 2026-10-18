import { z } from 'zod';

import { HOUSEHOLD_REQUIRED_ERROR_CODE, HOUSEHOLD_REQUIRED_MESSAGE, householdSummarySchema } from './household';

/**
 * One-time invitations into a household (decision Р5, flow 5.4 in
 * `development/decisions/telegram-auth-and-households-v1.md`).
 *
 * Owner, browser session only (never the MCP key):
 * - `POST /api/household/invitations` creates one and answers its link **once**; the link cannot be read again;
 * - `GET /api/household/invitations` lists the active ones, without links;
 * - `POST /api/household/invitations/:id/revoke` revokes one.
 *
 * Guest:
 * - `POST /api/invitations/preview { token }` (no session needed): household name and inviter name of an active
 *   invitation. Unknown, expired, used and revoked tokens get one and the same answer (`invitation-unavailable`);
 * - `POST /api/invitations/accept { token, replaceEmptyHousehold }` (browser session): joins as `member`.
 *
 * The token travels in request bodies only, never in an API path, so it does not land in access logs. In a browser
 * address it appears only on the invitation page `/invite/<token>`; the page moves it to `sessionStorage` and replaces
 * the address with `/invite` right away (Р5), so it never reaches `Referer` or the history.
 */

/** 32 random bytes in base64url: 43 characters. */
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The path of the invitation page; the link is `<origin>/invite/<token>`. */
export const INVITATION_PAGE_PATH = '/invite';

/** No more than this many active (not accepted, not revoked, not expired) invitations per household (Р5). */
export const MAX_ACTIVE_HOUSEHOLD_INVITATIONS = 3;

export const invitationTokenSchema = z.string().regex(INVITATION_TOKEN_PATTERN, 'Ссылка приглашения повреждена.');

export const invitationPreviewInputSchema = z.object({
	token: invitationTokenSchema
});

export type InvitationPreviewInput = z.infer<typeof invitationPreviewInputSchema>;

export const acceptInvitationInputSchema = z.object({
	/**
	 * The caller agreed that their own household, if it is empty and they are its only member, is deleted on joining
	 * (Р5). Without it such a caller gets `empty-household-confirmation-required` and nothing changes.
	 */
	replaceEmptyHousehold: z.boolean().default(false),
	token: invitationTokenSchema
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;

/**
 * The token of an invitation link, or `undefined` when the path is not an invitation link with a well-formed token.
 */
export function readInvitationTokenFromPath(pathname: string): string | undefined {
	const prefix = `${INVITATION_PAGE_PATH}/`;

	if (!pathname.startsWith(prefix)) {
		return undefined;
	}

	const token = pathname.slice(prefix.length).replace(/\/$/, '');

	return INVITATION_TOKEN_PATTERN.test(token) ? token : undefined;
}

export const householdInvitationErrorCodes = [
	'unauthenticated',
	'invalid-origin',
	'invalid-input',
	'payload-too-large',
	HOUSEHOLD_REQUIRED_ERROR_CODE,
	'owner-required',
	'invitation-limit-reached',
	'rate-limited',
	'invitation-not-found',
	'invitation-unavailable',
	'already-in-household',
	'empty-household-confirmation-required',
	'unexpected'
] as const;

export type HouseholdInvitationErrorCode = (typeof householdInvitationErrorCodes)[number];

export const householdInvitationErrorMessageByCode: Record<HouseholdInvitationErrorCode, string> = {
	unauthenticated: 'Требуется войти в приложение.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	'invalid-input': 'Ссылка приглашения повреждена. Попросите новую.',
	'payload-too-large': 'Слишком большой запрос.',
	[HOUSEHOLD_REQUIRED_ERROR_CODE]: HOUSEHOLD_REQUIRED_MESSAGE,
	'owner-required': 'Это может сделать только владелец окружения.',
	'invitation-limit-reached': `Уже есть ${MAX_ACTIVE_HOUSEHOLD_INVITATIONS} активных приглашения. Отзовите одно, чтобы создать новое.`,
	'rate-limited': 'Слишком много попыток. Попробуйте позже.',
	'invitation-not-found': 'Приглашение не найдено или уже недействительно.',
	'invitation-unavailable': 'Ссылка приглашения недействительна: она устарела, уже использована или отозвана. Попросите новую.',
	'already-in-household': 'Вы уже состоите в окружении. Чтобы перейти, сначала покиньте его.',
	'empty-household-confirmation-required': 'Ваше пустое окружение будет удалено, и вы перейдёте по приглашению.',
	unexpected: 'Не удалось выполнить действие. Попробуйте ещё раз.'
};

export const householdInvitationFailureSchema = z.object({
	/**
	 * The caller's own household, only with `already-in-household` and `empty-household-confirmation-required`, for
	 * «Вы уже состоите в окружении «X»» and «Ваше пустое окружение «X» будет удалено». Never the invited household.
	 */
	currentHousehold: z.object({ name: z.string() }).optional(),
	errorCode: z.enum(householdInvitationErrorCodes),
	fieldErrors: z.record(z.string(), z.string()).optional(),
	message: z.string(),
	ok: z.literal(false)
});

export type HouseholdInvitationFailure = z.infer<typeof householdInvitationFailureSchema>;

/** The answer of `POST /api/household/invitations`: the only time the link is shown. */
export const createdHouseholdInvitationSchema = z.object({
	expiresAt: z.string().min(1),
	id: z.string().min(1),
	link: z.url()
});

export type CreatedHouseholdInvitation = z.infer<typeof createdHouseholdInvitationSchema>;

export const createHouseholdInvitationResultSchema = z.discriminatedUnion('ok', [
	z.object({
		invitation: createdHouseholdInvitationSchema,
		ok: z.literal(true)
	}),
	householdInvitationFailureSchema
]);

export type CreateHouseholdInvitationResult = z.infer<typeof createHouseholdInvitationResultSchema>;

/** An active invitation in the owner's list: no link and no token, they are not stored. */
export const activeHouseholdInvitationSchema = z.object({
	createdAt: z.string().min(1),
	createdBy: z.object({ displayName: z.string() }),
	expiresAt: z.string().min(1),
	id: z.string().min(1)
});

export type ActiveHouseholdInvitation = z.infer<typeof activeHouseholdInvitationSchema>;

export const householdInvitationsResultSchema = z.discriminatedUnion('ok', [
	z.object({
		invitations: z.array(activeHouseholdInvitationSchema),
		ok: z.literal(true)
	}),
	householdInvitationFailureSchema
]);

export type HouseholdInvitationsResult = z.infer<typeof householdInvitationsResultSchema>;

export const revokeHouseholdInvitationResultSchema = z.discriminatedUnion('ok', [
	z.object({ ok: z.literal(true) }),
	householdInvitationFailureSchema
]);

export type RevokeHouseholdInvitationResult = z.infer<typeof revokeHouseholdInvitationResultSchema>;

/** What a guest sees before signing in: nothing beyond the two names and the deadline (Р5). */
export const invitationPreviewSchema = z.object({
	expiresAt: z.string().min(1),
	householdName: z.string(),
	inviterName: z.string()
});

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const invitationPreviewResultSchema = z.discriminatedUnion('ok', [
	z.object({
		invitation: invitationPreviewSchema,
		ok: z.literal(true)
	}),
	householdInvitationFailureSchema
]);

export type InvitationPreviewResult = z.infer<typeof invitationPreviewResultSchema>;

export const acceptInvitationResultSchema = z.discriminatedUnion('ok', [
	z.object({
		/** The household joined, with the role `member`. */
		household: householdSummarySchema,
		ok: z.literal(true)
	}),
	householdInvitationFailureSchema
]);

export type AcceptInvitationResult = z.infer<typeof acceptInvitationResultSchema>;
