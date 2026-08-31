import { z } from 'zod';

/**
 * Home page search-param schema. Extend here as more filters move into the URL.
 */
export const homeSearchParamsSchema = z.object({
	account: z.string().trim().min(1).max(128).optional(),
	from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
	period: z.enum(['week', 'month', 'year']).optional().catch(undefined)
});

/**
 * Typed home route search state.
 */
export type HomeSearchParams = z.infer<typeof homeSearchParamsSchema>;
