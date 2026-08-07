import type { HealthResponse } from '@i-finances/contracts';

export type ApiEnvironment = {
	Variables: Record<never, never>;
	Bindings: Record<never, never>;
};

export type ApiHealthResponse = HealthResponse;
