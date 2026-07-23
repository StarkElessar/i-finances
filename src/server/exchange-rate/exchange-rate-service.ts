import { randomUUID } from 'node:crypto';

import { ExchangeRateNotFoundError } from './exchange-rate-errors';
import {
    toExchangeRateQuote,
    toPersistedExchangeRate
} from './exchange-rate-mappers';
import type {
    ExchangeRateService,
    ExchangeRateServiceDependencies
} from './exchange-rate-service.types';

import type {
    ExchangeRateQuote,
    ResolveExchangeRateInput,
    UpsertExchangeRateInput
} from '~/entities/exchange-rate';
import {
    resolveExchangeRateInputSchema,
    upsertExchangeRateInputSchema
} from '~/entities/exchange-rate';
import { invertExchangeRate } from '~/shared/lib';

export type {
    ExchangeRateResolver,
    ExchangeRateService,
    ExchangeRateServiceDependencies
} from './exchange-rate-service.types';

/**
 * Creates the application service used to maintain and resolve exchange rates.
 */
export function createExchangeRateService(
    dependencies: ExchangeRateServiceDependencies
): ExchangeRateService {
    const createId = dependencies.createId ?? randomUUID;
    const now = dependencies.now ?? (() => new Date());

    const resolve = async (
        unsafeInput: ResolveExchangeRateInput
    ): Promise<ExchangeRateQuote> => {
        const input = resolveExchangeRateInputSchema.parse(unsafeInput);

        if (input.fromCurrency === input.toCurrency) {
            return {
                effectiveOn: input.onDate,
                fromCurrency: input.fromCurrency,
                rate: '1',
                source: 'identity',
                toCurrency: input.toCurrency
            };
        }

        const directRecord = await dependencies.exchangeRateRepository.findLatest({
            fromCurrency: input.fromCurrency,
            onOrBefore: input.onDate,
            toCurrency: input.toCurrency
        });

        if (directRecord !== undefined) {
            return toExchangeRateQuote(directRecord);
        }

        const inverseRecord = await dependencies.exchangeRateRepository.findLatest({
            fromCurrency: input.toCurrency,
            onOrBefore: input.onDate,
            toCurrency: input.fromCurrency
        });

        if (inverseRecord !== undefined) {
            return {
                effectiveOn: inverseRecord.effectiveOn,
                fromCurrency: input.fromCurrency,
                rate: invertExchangeRate(inverseRecord.rate),
                source: inverseRecord.source,
                toCurrency: input.toCurrency
            };
        }

        throw new ExchangeRateNotFoundError(input);
    };

    const upsert = async (
        unsafeInput: UpsertExchangeRateInput
    ) => {
        const input = upsertExchangeRateInputSchema.parse(unsafeInput);
        const timestamp = now();
        const record = await dependencies.exchangeRateRepository.upsert({
            ...input,
            createdAt: timestamp,
            id: createId(),
            updatedAt: timestamp
        });

        return toPersistedExchangeRate(record);
    };

    return {
        resolve,
        upsert
    };
}
