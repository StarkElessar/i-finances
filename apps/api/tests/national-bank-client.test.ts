import {
	NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
	NationalBankExchangeRateClient,
	NationalBankExchangeRateClientError
} from '@/modules/exchange-rate/national-bank-client';

import { describe, expect, it } from 'vitest';

describe('national bank exchange-rate client', () => {
	it('fetches and normalizes daily NBRB rates', async () => {
		let requestedUrl = '';
		const client = new NationalBankExchangeRateClient({
			endpoint: 'https://example.test/rates',
			fetch: async (input) => {
				requestedUrl = typeof input === 'string'
					? input
					: input instanceof URL ? input.toString() : input.url;

				return new Response(JSON.stringify([
					{
						Cur_Abbreviation: 'USD',
						Cur_OfficialRate: 2.8853,
						Cur_Scale: 1,
						Date: '2026-07-24T00:00:00'
					},
					{
						Cur_Abbreviation: 'EUR',
						Cur_OfficialRate: 32.928,
						Cur_Scale: 10,
						Date: '2026-07-24T00:00:00'
					}
				]));
			}
		});

		await expect(client.getDailyRates({
			baseCurrency: 'BYN',
			currencies: ['USD', 'EUR'],
			requestedOn: '2026-07-24'
		})).resolves.toEqual([
			{
				effectiveOn: '2026-07-24',
				fromCurrency: 'USD',
				rate: '2.8853',
				source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
				toCurrency: 'BYN'
			},
			{
				effectiveOn: '2026-07-24',
				fromCurrency: 'EUR',
				rate: '3.2928',
				source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
				toCurrency: 'BYN'
			}
		]);
		expect(requestedUrl).toBe(
			'https://example.test/rates?ondate=2026-07-24&periodicity=0'
		);
	});

	it('rejects an incomplete provider response', async () => {
		const client = new NationalBankExchangeRateClient({
			endpoint: 'https://example.test/rates',
			fetch: async () => new Response(JSON.stringify([
				{
					Cur_Abbreviation: 'USD',
					Cur_OfficialRate: 2.8853,
					Cur_Scale: 1,
					Date: '2026-07-24T00:00:00'
				}
			]))
		});

		await expect(client.getDailyRates({
			baseCurrency: 'BYN',
			currencies: ['USD', 'EUR'],
			requestedOn: '2026-07-24'
		})).rejects.toBeInstanceOf(NationalBankExchangeRateClientError);
	});
});
