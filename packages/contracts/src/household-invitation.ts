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
 *   invitation. Unknown, expired, used and revoked tokens get the same answer in the same shape (404
 *   `invitation-unavailable`), told apart only by the optional `reason` (decision of 2026-10-19: four states on the
 *   board `Flow-Invite`), which is given for a well-formed token only;
 * - `POST /api/invitations/accept { token, replaceEmptyHousehold }` (browser session): joins as `member`.
 *
 * The same link and the same `preview` serve the invitations into the application (`app-invitation.ts`,
 * `development/decisions/app-invitations-v1.md`): the server tells the kind by the token's hash, and the preview answers
 * `kind: 'app'` with the inviter's name and no household. Such a link is used by signing up through Telegram with it,
 * never by `accept` (409 `app-invitation-not-acceptable`).
 *
 * The token travels in request bodies only, never in an API path, so it does not land in access logs. The link is
 * `<origin>/invite#<token>` (review decision A6, Р5): the fragment is never sent by the browser, so the token reaches
 * neither the nginx access log of the page nor any `Referer`. The page moves it to `sessionStorage` and replaces the
 * address with `/invite` right away, so it does not stay in the address bar and the history entry.
 */

/** 32 random bytes in base64url: 43 characters. */
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The path of the invitation page; the link is `<origin>/invite#<token>`, the token in the fragment. */
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

/** The parts of an address the invitation page reads: `window.location` and `new URL(pastedLink)` both fit. */
export type InvitationLinkLocation = {
	hash: string;
	pathname: string;
};

/**
 * The token of an invitation link `<origin>/invite#<token>`, or `undefined` when the address is not the invitation
 * page or its fragment is not a well-formed token. A token in the path (`/invite/<token>`) is not read: such a link
 * would have put the token into the access log.
 */
export function readInvitationTokenFromLocation(location: InvitationLinkLocation): string | undefined {
	if (location.pathname !== INVITATION_PAGE_PATH && location.pathname !== `${INVITATION_PAGE_PATH}/`) {
		return undefined;
	}

	const token = location.hash.startsWith('#') ? location.hash.slice(1) : '';

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
	'app-invitation-not-acceptable',
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
	'app-invitation-not-acceptable': 'Это приглашение в приложение, а не в окружение: создайте своё окружение.',
	unexpected: 'Не удалось выполнить действие. Попробуйте ещё раз.'
};

/**
 * Why a well-formed invitation token opens nothing (404 `invitation-unavailable`), for the four texts of the board
 * `Flow-Invite`. `unknown` is a token no invitation has; `used` is also what the loser of two parallel acceptances
 * gets. When several apply, `used` and `revoked` win over `expired`.
 */
export const householdInvitationUnavailableReasons = ['expired', 'used', 'revoked', 'unknown'] as const;

export type HouseholdInvitationUnavailableReason = (typeof householdInvitationUnavailableReasons)[number];

export const householdInvitationFailureSchema = z.object({
	/**
	 * The caller's own household, only with `already-in-household` and `empty-household-confirmation-required`, for
	 * «Вы уже состоите в окружении «X»» and «Ваше пустое окружение «X» будет удалено». Never the invited household.
	 */
	currentHousehold: z.object({ name: z.string() }).optional(),
	errorCode: z.enum(householdInvitationErrorCodes),
	fieldErrors: z.record(z.string(), z.string()).optional(),
	message: z.string(),
	ok: z.literal(false),
	/**
	 * Only with `invitation-unavailable` on `preview` and `accept`, and only when the token was well-formed (a
	 * malformed one is `invalid-input` with no reason). Optional: the status, the code and the message do not change.
	 */
	reason: z.enum(householdInvitationUnavailableReasons).optional()
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

/** The two kinds of invitation one link can be: into a household (Р5) or into the application. */
export const invitationKinds = ['household', 'app'] as const;

export type InvitationKind = (typeof invitationKinds)[number];

/**
 * What a guest sees before signing in, and nothing beyond it (Р5): the inviter's name and the deadline, plus the
 * household's name for an invitation into a household. An invitation into the application has no household, so it
 * has no `householdName`.
 *
 * The API always sends `kind`. It is optional in the schema, and `householdName` is optional, only so that clients and
 * fixtures written before application invitations keep compiling; an answer without `kind` is a household invitation.
 * The refinement keeps the two consistent: `householdName` is present exactly when the kind is not `app`.
 */
export const invitationPreviewSchema = z.object({
	expiresAt: z.string().min(1),
	householdName: z.string().optional(),
	inviterName: z.string(),
	kind: z.enum(invitationKinds).optional()
}).refine(
	(preview) => (preview.kind === 'app') === (preview.householdName === undefined),
	'An application invitation has no household name; a household invitation has one.'
);

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
