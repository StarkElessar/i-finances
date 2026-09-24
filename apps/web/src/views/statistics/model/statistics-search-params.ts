import { z } from 'zod';

const monthKey = z.string().trim().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);

/**
 * Statistics page search state. Every field is optional and invalid values
 * fall back to absent, so a hand-edited URL never breaks the page.
 */
export const statisticsSearchParamsSchema = z.object({
	by: z.enum(['category', 'contact']).optional().catch(undefined),
	from: monthKey.optional().catch(undefined),
	ids: z.string().trim().min(1).max(8000).optional().catch(undefined),
	tab: z.enum(['overview', 'compare']).optional().catch(undefined),
	to: monthKey.optional().catch(undefined)
});

export type StatisticsSearchParams = z.infer<typeof statisticsSearchParamsSchema>;
