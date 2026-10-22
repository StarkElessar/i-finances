import { z } from 'zod';

/**
 * One-time invitations into the application (`development/decisions/app-invitations-v1.md`). Registration of new
 * people is closed (`TELEGRAM_REGISTRATION_ENABLED=false`); the holder of such a link may still sign up through
 * Telegram, starts without a household and founds their own, becoming its owner.
 *
 * Platform administrator only (`PLATFORM_ADMIN_USERNAMES`), browser session only (never the MCP key):
 * - `POST /api/app-invitations { note? }` creates one and answers its link **once**; the link cannot be read again;
 * - `GET /api/app-invitations` lists the active ones and the recently accepted ones, without links;
 * - `POST /api/app-invitations/:id/revoke` revokes an active one.
 *
 * To anyone else these routes answer exactly like a route that does not exist (404 `not_found`); without a session
 * they answer 401. The link has the form of a household invitation link, `<origin>/invite#<token>`: one page reads
 * both, and `POST /api/invitations/preview` tells the kind (`kind: 'app'`).
 */

/** At most this many active (not accepted, not revoked, not expired) application invitations at once. */
export const MAX_ACTIVE_APP_INVITATIONS = 20;

/** At most this many application invitations created within 24 hours, whatever happened to them since. */
export const MAX_APP_INVITATIONS_PER_DAY = 50;

/** The administrator's own note about whom the invitation is for. */
export const APP_INVITATION_NOTE_MAX_LENGTH = 80;

/** Control and format characters (line breaks, zero-width and direction marks) are refused in a note. */
const NOTE_FORBIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

export const appInvitationNoteSchema = z.string()
	.trim()
	.max(APP_INVITATION_NOTE_MAX_LENGTH, `Заметка не длиннее ${APP_INVITATION_NOTE_MAX_LENGTH} символов.`)
	.refine((value) => !NOTE_FORBIDDEN_CHARACTERS.test(value), 'Заметка содержит недопустимые символы.');

export const createAppInvitationInputSchema = z.object({
	/** Optional; an empty note after trimming is stored as none. */
	note: appInvitationNoteSchema.optional()
});

export type CreateAppInvitationInput = z.infer<typeof createAppInvitationInputSchema>;

export const appInvitationErrorCodes = [
	'unauthenticated',
	'invalid-origin',
	'invalid-input',
	'payload-too-large',
	'invitation-limit-reached',
	'rate-limited',
	'invitation-not-found',
	'unexpected'
] as const;

export type AppInvitationErrorCode = (typeof appInvitationErrorCodes)[number];

export const appInvitationErrorMessageByCode: Record<AppInvitationErrorCode, string> = {
	unauthenticated: 'Требуется войти в приложение.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	'invalid-input': 'Проверьте заметку.',
	'payload-too-large': 'Слишком большой запрос.',
	'invitation-limit-reached': `Уже есть ${MAX_ACTIVE_APP_INVITATIONS} активных приглашений. Отзовите одно, чтобы создать новое.`,
	'rate-limited': `За сутки можно создать не больше ${MAX_APP_INVITATIONS_PER_DAY} приглашений. Попробуйте позже.`,
	'invitation-not-found': 'Приглашение не найдено или уже недействительно.',
	unexpected: 'Не удалось выполнить действие. Попробуйте ещё раз.'
};

export const appInvitationFailureSchema = z.object({
	errorCode: z.enum(appInvitationErrorCodes),
	fieldErrors: z.record(z.string(), z.string()).optional(),
	message: z.string(),
	ok: z.literal(false)
});

export type AppInvitationFailure = z.infer<typeof appInvitationFailureSchema>;

/** The answer of `POST /api/app-invitations`: the only time the link is shown. */
export const createdAppInvitationSchema = z.object({
	expiresAt: z.string().min(1),
	id: z.string().min(1),
	link: z.url()
});

export type CreatedAppInvitation = z.infer<typeof createdAppInvitationSchema>;

export const createAppInvitationResultSchema = z.discriminatedUnion('ok', [
	z.object({
		invitation: createdAppInvitationSchema,
		ok: z.literal(true)
	}),
	appInvitationFailureSchema
]);

export type CreateAppInvitationResult = z.infer<typeof createAppInvitationResultSchema>;

export const appInvitationStatuses = ['active', 'accepted'] as const;

export type AppInvitationStatus = (typeof appInvitationStatuses)[number];

/**
 * An invitation in the administrator's list: no link, no token and no hash. `accepted` ones are listed for a while
 * after the sign-up (`acceptedBy`: the user it created, with the Telegram username without `@`, `null` when the person
 * has none); revoked and expired ones are not.
 */
export const appInvitationListItemSchema = z.object({
	acceptedAt: z.string().min(1).nullable(),
	acceptedBy: z.object({ displayName: z.string(), telegramUsername: z.string().nullable() }).nullable(),
	createdAt: z.string().min(1),
	expiresAt: z.string().min(1),
	id: z.string().min(1),
	note: z.string().nullable(),
	status: z.enum(appInvitationStatuses)
});

export type AppInvitationListItem = z.infer<typeof appInvitationListItemSchema>;

export const appInvitationsResultSchema = z.discriminatedUnion('ok', [
	z.object({
		invitations: z.array(appInvitationListItemSchema),
		ok: z.literal(true)
	}),
	appInvitationFailureSchema
]);

export type AppInvitationsResult = z.infer<typeof appInvitationsResultSchema>;

export const revokeAppInvitationResultSchema = z.discriminatedUnion('ok', [
	z.object({ ok: z.literal(true) }),
	appInvitationFailureSchema
]);

export type RevokeAppInvitationResult = z.infer<typeof revokeAppInvitationResultSchema>;
