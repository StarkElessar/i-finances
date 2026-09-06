import { ExchangeRateClient } from '@/features/exchange-rate/api';

import type { CurrentExchangeRates } from '@i-finances/contracts';
import { query } from '@solidjs/router';

const client = new ExchangeRateClient();

export const getCurrentExchangeRates = query(
	(): Promise<CurrentExchangeRates> => client.current(),
	'current-exchange-rates'
);
