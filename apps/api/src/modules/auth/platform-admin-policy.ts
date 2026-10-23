import type { SessionUser } from './session-service';

/**
 * Who is a platform administrator: the only people who may invite someone into the application itself
 * (`development/decisions/app-invitations-v1.md`). Decided by the login (`users.username`) of the signed-in user and
 * nothing else: never by the display name, which anyone sets for themselves, and never by a household role.
 *
 * The stored login is compared as it is, against the normalized list from `PLATFORM_ADMIN_USERNAMES`. Logins are
 * stored normalized (lower case, `seed-auth-user.ts`), so a login that is not normalized never matches: the check
 * fails closed instead of treating «Stark» and «stark» as one person. An empty list means nobody.
 */
export class PlatformAdminPolicy {
	public constructor(private readonly usernames: ReadonlySet<string>) {}

	public isPlatformAdmin(user: Pick<SessionUser, 'username'>): boolean {
		return this.usernames.has(user.username);
	}
}
