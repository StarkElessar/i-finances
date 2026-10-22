import { randomUUID } from 'node:crypto';

import type { PlatformAdminPolicy, SessionUser } from '@/modules/auth';
import { generateHouseholdInvitationToken, hashHouseholdInvitationToken } from '@/modules/household';

import {
	type AppInvitationErrorCode,
	type AppInvitationListItem,
	collectFieldErrors,
	createAppInvitationInputSchema,
	type CreatedAppInvitation,
	INVITATION_PAGE_PATH,
	MAX_ACTIVE_APP_INVITATIONS,
	MAX_APP_INVITATIONS_PER_DAY
} from '@i-finances/contracts';

import type { AppInvitationConfig } from './app-invitation-config';
import type { AppInvitationRepository } from './app-invitation-repository';

/** How long an accepted invitation stays in the administrator's list. */
const ACCEPTED_LIST_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export type AppInvitationServiceDependencies = {
	config: AppInvitationConfig;
	createId?: () => string;
	createToken?: () => string;
	invitations: Pick<AppInvitationRepository, 'create' | 'list' | 'revoke'>;
	now?: () => Date;
	/** `AUTH_ORIGIN`: the links point to the web application. */
	origin: string;
	platformAdmins: Pick<PlatformAdminPolicy, 'isPlatformAdmin'>;
};

export type AppInvitationOutcome<TValue> =
	| ({ ok: true } & TValue)
	| { errorCode: AppInvitationErrorCode; fieldErrors?: Record<string, string>; ok: false }
	/** The caller is not a platform administrator: the HTTP layer answers like a route that does not exist. */
	| { notFound: true; ok: false };

/**
 * Invitations into the application (`development/decisions/app-invitations-v1.md`): only a platform administrator
 * creates, lists and revokes them. The controller checks the administrator first; every method checks again, so the
 * service is safe on its own (one rule, `PlatformAdminPolicy`).
 *
 * The token is generated here, shown once inside the link `<origin>/invite#<token>` and forgotten: only its SHA-256
 * goes further. The format and the page are those of household invitations, so one link page serves both kinds.
 */
export class AppInvitationService {
	private readonly createId: () => string;
	private readonly createToken: () => string;
	private readonly now: () => Date;

	public constructor(private readonly dependencies: AppInvitationServiceDependencies) {
		this.createId = dependencies.createId ?? randomUUID;
		this.createToken = dependencies.createToken ?? generateHouseholdInvitationToken;
		this.now = dependencies.now ?? (() => new Date());
	}

	public async create(actor: SessionUser, input: unknown): Promise<AppInvitationOutcome<{ invitation: CreatedAppInvitation }>> {
		if (!this.dependencies.platformAdmins.isPlatformAdmin(actor)) {
			return { notFound: true, ok: false };
		}

		const parsedInput = createAppInvitationInputSchema.safeParse(input);

		if (!parsedInput.success) {
			return { errorCode: 'invalid-input', fieldErrors: collectFieldErrors(parsedInput.error), ok: false };
		}

		const now = this.now();
		const token = this.createToken();
		const id = this.createId();
		const expiresAt = new Date(now.getTime() + this.dependencies.config.ttlMilliseconds);
		const note = parsedInput.data.note === undefined || parsedInput.data.note === '' ? null : parsedInput.data.note;
		const creation = this.dependencies.invitations.create({
			createdAt: now,
			createdByUserId: actor.id,
			expiresAt,
			id,
			note,
			tokenHash: hashHouseholdInvitationToken(token)
		}, { maxActive: MAX_ACTIVE_APP_INVITATIONS, maxPerDay: MAX_APP_INVITATIONS_PER_DAY });

		switch (creation.kind) {
			case 'active-limit':
				return { errorCode: 'invitation-limit-reached', ok: false };
			case 'daily-limit':
				return { errorCode: 'rate-limited', ok: false };
			case 'created':
				return { invitation: { expiresAt: expiresAt.toISOString(), id, link: this.buildLink(token) }, ok: true };
		}
	}

	public async list(actor: SessionUser): Promise<AppInvitationOutcome<{ invitations: AppInvitationListItem[] }>> {
		if (!this.dependencies.platformAdmins.isPlatformAdmin(actor)) {
			return { notFound: true, ok: false };
		}

		const now = this.now();
		const records = await this.dependencies.invitations.list(now, new Date(now.getTime() - ACCEPTED_LIST_MILLISECONDS));

		return {
			invitations: records.map((record) => ({
				acceptedAt: record.acceptedAt?.toISOString() ?? null,
				acceptedBy: record.acceptedAt === null
					? null
					: { displayName: record.acceptedByDisplayName ?? '', telegramUsername: record.acceptedByTelegramUsername },
				createdAt: record.createdAt.toISOString(),
				expiresAt: record.expiresAt.toISOString(),
				id: record.id,
				note: record.note,
				status: record.acceptedAt === null ? 'active' : 'accepted'
			})),
			ok: true
		};
	}

	/** `invitation-not-found` for an unknown id and for an invitation that is no longer active alike. */
	public async revoke(actor: SessionUser, invitationId: string): Promise<AppInvitationOutcome<object>> {
		if (!this.dependencies.platformAdmins.isPlatformAdmin(actor)) {
			return { notFound: true, ok: false };
		}

		return this.dependencies.invitations.revoke(invitationId, this.now())
			? { ok: true }
			: { errorCode: 'invitation-not-found', ok: false };
	}

	/** `<origin>/invite#<token>`: the token in the fragment, never sent by the browser (Р5, review A6). */
	private buildLink(token: string): string {
		const link = new URL(INVITATION_PAGE_PATH, this.dependencies.origin);

		link.hash = token;

		return link.toString();
	}
}
