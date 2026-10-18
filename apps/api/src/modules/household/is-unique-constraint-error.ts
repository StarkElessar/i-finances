const UNIQUE_CONSTRAINT_CODES = new Set(['SQLITE_CONSTRAINT_PRIMARYKEY', 'SQLITE_CONSTRAINT_UNIQUE']);

/**
 * True for a primary-key or unique violation, also when Drizzle wraps the driver error in `cause`. The unique index on
 * `household_members.user_id` reports a membership another request created in parallel this way.
 */
export function isUniqueConstraintError(error: unknown): boolean {
	let current: unknown = error;

	while (typeof current === 'object' && current !== null) {
		const code = (current as { code?: unknown }).code;

		if (typeof code === 'string' && UNIQUE_CONSTRAINT_CODES.has(code)) {
			return true;
		}

		current = (current as { cause?: unknown }).cause;
	}

	return false;
}
