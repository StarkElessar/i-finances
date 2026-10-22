import { normalizeUsername } from './normalize-username';
import { PlatformAdminPolicy } from './platform-admin-policy';

/** The rule of the sign-in form for a login (`passwordSignInInputSchema`), after normalization. */
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]{3,64}$/u;

/**
 * Parses `PLATFORM_ADMIN_USERNAMES`: logins separated by commas, each trimmed and lower-cased like a login at sign-in;
 * empty entries are dropped. Unset or empty means no administrator. An entry that cannot be a login throws, so the API
 * refuses to start instead of silently having no administrator (the message names the variable, never its value).
 */
export function parsePlatformAdminUsernames(raw: string | undefined): ReadonlySet<string> {
	const usernames = (raw ?? '').split(',').map(normalizeUsername).filter((username) => username !== '');

	if (usernames.some((username) => !USERNAME_PATTERN.test(username))) {
		throw new RangeError('PLATFORM_ADMIN_USERNAMES must be logins separated by commas.');
	}

	return new Set(usernames);
}

export function getPlatformAdminPolicy(environment: NodeJS.ProcessEnv): PlatformAdminPolicy {
	return new PlatformAdminPolicy(parsePlatformAdminUsernames(environment.PLATFORM_ADMIN_USERNAMES));
}
