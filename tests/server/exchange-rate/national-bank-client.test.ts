import {
    describe,
    expect,
    it
} from 'vitest';

import {
    createNationalBankExchangeRateClient,
    NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
    NationalBankExchangeRateClientError
} from '~/server/exchange-rate/national-bank-client';
import { CurrencyCode } from '~/shared/lib';

describe('national bank exchange-rate client', () => {
    it('fetches and normalizes daily NBRB rates', async () => {
        let requestedUrl = '';
        const client = createNationalBankExchangeRateClient({
            endpoint: 'https://example.test/rates',
            fetch: async (input) => {
                requestedUrl = input.toString();

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
            baseCurrency: CurrencyCode.BYN,
            currencies: [CurrencyCode.USD, CurrencyCode.EUR],
            requestedOn: '2026-07-24'
        })).resolves.toEqual([
            {
                effectiveOn: '2026-07-24',
                fromCurrency: CurrencyCode.USD,
                rate: '2.8853',
                source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
                toCurrency: CurrencyCode.BYN
            },
            {
                effectiveOn: '2026-07-24',
                fromCurrency: CurrencyCode.EUR,
                rate: '3.2928',
                source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
                toCurrency: CurrencyCode.BYN
            }
        ]);
        expect(requestedUrl).toBe(
            'https://example.test/rates?ondate=2026-07-24&periodicity=0'
        );
    });

    it('rejects an incomplete provider response', async () => {
        const client = createNationalBankExchangeRateClient({
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
            baseCurrency: CurrencyCode.BYN,
            currencies: [CurrencyCode.USD, CurrencyCode.EUR],
            requestedOn: '2026-07-24'
        })).rejects.toBeInstanceOf(NationalBankExchangeRateClientError);
    });
});
