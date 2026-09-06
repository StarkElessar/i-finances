import {
	ApiClient,
	type ApiClient as ApiClientType,
	type ApiClientOptions
} from '@/shared/api';

import type { CurrentExchangeRates } from '@i-finances/contracts';
import { currentExchangeRatesSchema } from '@i-finances/contracts';

export type ExchangeRateClientOptions = ApiClientOptions & {
	client?: ApiClientType;
};

export class ExchangeRateClient {
	private readonly client: ApiClientType;

	public constructor(options: ExchangeRateClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public current(): Promise<CurrentExchangeRates> {
		return this.client.get('/api/exchange-rates/current', currentExchangeRatesSchema);
	}
}
