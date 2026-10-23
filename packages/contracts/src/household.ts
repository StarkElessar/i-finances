import { z } from 'zod';

import { currencyCodeSchema } from './category';

/**
 * Contracts of the household (окружение): the shared finance workspace a user
 * belongs to. A user belongs to at most one household; a signed-in user
 * without one is in onboarding and every household-scoped route answers 403
 * `household-required` (`development/decisions/telegram-auth-and-households-v1.md`, Р4, Р8).
 */

export const HOUSEHOLD_REQUIRED_ERROR_CODE = 'household-required';

export const HOUSEHOLD_REQUIRED_MESSAGE = 'Вы пока не состоите в окружении. Создайте своё или примите приглашение.';

/**
 * Body of the 403 answered by every household-scoped route when the caller has
 * no household. It is the same for all routes, so clients can recognise it
 * before parsing the route's own result.
 */
export const householdRequiredFailureSchema = z.object({
	errorCode: z.literal(HOUSEHOLD_REQUIRED_ERROR_CODE),
	message: z.string(),
	ok: z.literal(false)
});

export type HouseholdRequiredFailure = z.infer<typeof householdRequiredFailureSchema>;

/**
 * True when an API error body says the caller has no household yet.
 */
export function isHouseholdRequiredFailure(body: unknown): body is HouseholdRequiredFailure {
	return householdRequiredFailureSchema.safeParse(body).success;
}

export const householdRoleSchema = z.enum(['owner', 'member']);

export type HouseholdRole = z.infer<typeof householdRoleSchema>;

export const HOUSEHOLD_NAME_MAX_LENGTH = 120;

export const householdNameSchema = z.string()
	.trim()
	.min(1, 'Введите название окружения.')
	.max(HOUSEHOLD_NAME_MAX_LENGTH, 'Название окружения слишком длинное.');

export const createHouseholdInputSchema = z.object({
	name: householdNameSchema
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdInputSchema>;

export const updateHouseholdInputSchema = z.object({
	name: householdNameSchema
});

export type UpdateHouseholdInput = z.infer<typeof updateHouseholdInputSchema>;

/**
 * The caller's household as `GET /api/auth/session` reports it.
 */
export const householdSummarySchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	role: householdRoleSchema
});

export type HouseholdSummary = z.infer<typeof householdSummarySchema>;

export const householdMemberSchema = z.object({
	displayName: z.string(),
	joinedAt: z.string().min(1),
	role: householdRoleSchema,
	telegramUsername: z.string().nullable(),
	userId: z.string().min(1)
});

export type HouseholdMember = z.infer<typeof householdMemberSchema>;

export const householdDetailsSchema = householdSummarySchema.extend({
	baseCurrency: currencyCodeSchema,
	members: z.array(householdMemberSchema)
});

export type HouseholdDetails = z.infer<typeof householdDetailsSchema>;

/**
 * `POST /api/household` refused: the caller may not found a household (owner's decision 2026-10-23,
 * `development/decisions/app-invitations-v1.md`, section 13). Only a platform administrator, a person who signed up with
 * an invitation into the application, and a person who is or was an owner of a household may; somebody who came with a
 * household invitation joins a household instead. `GET /api/auth/session` tells it in advance (`canCreateHousehold`).
 */
export const HOUSEHOLD_CREATION_NOT_ALLOWED_ERROR_CODE = 'household-creation-not-allowed';

export const HOUSEHOLD_CREATION_NOT_ALLOWED_MESSAGE
	= 'Создать своё окружение можно только по приглашению в приложение. Чтобы вести финансы вместе с близкими, '
		+ 'примите их приглашение в окружение.';

export const householdErrorCodes = [
	'unauthenticated',
	'invalid-origin',
	'invalid-input',
	HOUSEHOLD_REQUIRED_ERROR_CODE,
	HOUSEHOLD_CREATION_NOT_ALLOWED_ERROR_CODE,
	'already-in-household',
	'owner-required',
	'member-not-found',
	'cannot-remove-self',
	'last-owner',
	'unexpected'
] as const;

export type HouseholdErrorCode = (typeof householdErrorCodes)[number];

export const householdErrorMessageByCode: Record<HouseholdErrorCode, string> = {
	unauthenticated: 'Требуется войти в приложение.',
	'invalid-origin': 'Не удалось подтвердить источник запроса. Обновите страницу и попробуйте снова.',
	'invalid-input': 'Проверьте название окружения.',
	[HOUSEHOLD_REQUIRED_ERROR_CODE]: HOUSEHOLD_REQUIRED_MESSAGE,
	[HOUSEHOLD_CREATION_NOT_ALLOWED_ERROR_CODE]: HOUSEHOLD_CREATION_NOT_ALLOWED_MESSAGE,
	'already-in-household': 'Вы уже состоите в окружении. Чтобы создать новое, сначала покиньте текущее.',
	'owner-required': 'Это может сделать только владелец окружения.',
	'member-not-found': 'Участник не найден.',
	'cannot-remove-self': 'Себя удалить нельзя.',
	'last-owner': 'Вы единственный владелец окружения, поэтому не можете его покинуть.',
	unexpected: 'Не удалось выполнить действие. Попробуйте ещё раз.'
};

export const householdFailureSchema = z.object({
	errorCode: z.enum(householdErrorCodes),
	fieldErrors: z.record(z.string(), z.string()).optional(),
	message: z.string(),
	ok: z.literal(false)
});

export type HouseholdFailure = z.infer<typeof householdFailureSchema>;

/**
 * Result of `GET`, `POST` and `PUT /api/household` and of `POST /api/household/members/:userId/remove` (the owner's
 * household after the removal, Р7).
 */
export const householdResultSchema = z.discriminatedUnion('ok', [
	z.object({
		household: householdDetailsSchema,
		ok: z.literal(true)
	}),
	householdFailureSchema
]);

export type HouseholdResult = z.infer<typeof householdResultSchema>;

/**
 * Result of `POST /api/household/leave` (flow 5.5): the session stays, the caller is in onboarding afterwards.
 */
export const householdLeaveResultSchema = z.discriminatedUnion('ok', [
	z.object({ ok: z.literal(true) }),
	householdFailureSchema
]);

export type HouseholdLeaveResult = z.infer<typeof householdLeaveResultSchema>;
