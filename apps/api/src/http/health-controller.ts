import {
	type HealthResponse,
	healthResponseSchema
} from '@i-finances/contracts';
import type { Context } from 'hono';

import type { ApiEnvironment } from './types';

export class HealthController {
	public get() {
		return (context: Context<ApiEnvironment>) => {
			const response: HealthResponse = {
				ok: true,
				service: 'api',
				version: 'workspace-shell'
			};

			return context.json(healthResponseSchema.parse(response), 200);
		};
	}
}
