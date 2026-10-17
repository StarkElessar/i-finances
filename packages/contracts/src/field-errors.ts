import type { z } from 'zod';

/**
 * Flattens Zod issues into `{ 'path.to.field': message }`.
 * The first issue per key wins; issues without a path are skipped.
 */
export function collectFieldErrors(error: z.ZodError): Record<string, string> {
	const fieldErrors: Record<string, string> = {};

	error.issues.forEach((issue) => {
		if (issue.path.length === 0) {
			return;
		}

		const key = issue.path.join('.');

		if (!(key in fieldErrors)) {
			fieldErrors[key] = issue.message;
		}
	});

	return fieldErrors;
}
