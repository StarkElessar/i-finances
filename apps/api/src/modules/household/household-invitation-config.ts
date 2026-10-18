/** 7 days: the owner's decision (2026-10-18), the spec had proposed 72 hours. */
const DEFAULT_TTL_HOURS = 168;

const MIN_TTL_HOURS = 1;

const MAX_TTL_HOURS = 168;

const HOUR_MILLISECONDS = 60 * 60 * 1000;

export type HouseholdInvitationConfig = {
	/** How long a new invitation lives (`HOUSEHOLD_INVITATION_TTL_HOURS`, 1-168, default 168 = 7 days, Р5 and Р12). */
	ttlMilliseconds: number;
};

/**
 * Reads `HOUSEHOLD_INVITATION_TTL_HOURS`. An empty value means the default; anything but a whole number of hours from
 * 1 to 168 throws, so the API refuses to start instead of handing out links with a surprising lifetime.
 */
export function getHouseholdInvitationConfig(environment: NodeJS.ProcessEnv): HouseholdInvitationConfig {
	const raw = environment.HOUSEHOLD_INVITATION_TTL_HOURS?.trim() ?? '';

	if (raw === '') {
		return { ttlMilliseconds: DEFAULT_TTL_HOURS * HOUR_MILLISECONDS };
	}

	const hours = Number(raw);

	if (!/^\d+$/.test(raw) || hours < MIN_TTL_HOURS || hours > MAX_TTL_HOURS) {
		throw new RangeError(`HOUSEHOLD_INVITATION_TTL_HOURS must be a whole number of hours from ${MIN_TTL_HOURS} to ${MAX_TTL_HOURS}`);
	}

	return { ttlMilliseconds: hours * HOUR_MILLISECONDS };
}
