import { upsertExchangeRateInputSchema } from '../src/entities/exchange-rate';
import { sqlite } from '../src/server/db/client';
import { createExchangeRateRepository } from '../src/server/exchange-rate/exchange-rate-repository';
import { createExchangeRateService } from '../src/server/exchange-rate/exchange-rate-service';

const ALLOWED_OPTIONS = new Set([
    'date',
    'from',
    'rate',
    'source',
    'to'
]);

/**
 * Parses `--name value` CLI arguments and rejects unknown or repeated options.
 */
function parseCliOptions(
    arguments_: readonly string[]
): Partial<Record<string, string>> {
    const normalizedArguments = arguments_[0] === '--'
        ? arguments_.slice(1)
        : arguments_;

    if (normalizedArguments.length % 2 !== 0) {
        throw new Error('Arguments must use the "--name value" format.');
    }

    const options: Partial<Record<string, string>> = {};

    for (let index = 0; index < normalizedArguments.length; index += 2) {
        const option = normalizedArguments[index];
        const value = normalizedArguments[index + 1];

        if (!option.startsWith('--')) {
            throw new Error('Arguments must use the "--name value" format.');
        }

        const name = option.slice(2);

        if (!ALLOWED_OPTIONS.has(name)) {
            throw new Error(`Unknown exchange-rate option: --${name}.`);
        }

        if (options[name] !== undefined) {
            throw new Error(`Exchange-rate option --${name} is repeated.`);
        }

        options[name] = value;
    }

    return options;
}

/**
 * Creates or updates one canonical daily exchange rate.
 */
async function upsertExchangeRate(): Promise<void> {
    const options = parseCliOptions(process.argv.slice(2));
    const input = upsertExchangeRateInputSchema.parse({
        effectiveOn: options.date,
        fromCurrency: options.from,
        rate: options.rate,
        source: options.source ?? 'manual',
        toCurrency: options.to
    });
    const service = createExchangeRateService({
        exchangeRateRepository: createExchangeRateRepository()
    });
    const result = await service.upsert(input);

    console.warn(
        `Stored ${result.fromCurrency}/${result.toCurrency}`
        + ` rate ${result.rate} for ${result.effectiveOn}`
        + ` from "${result.source}".`
    );
}

upsertExchangeRate()
    .catch((error: unknown) => {
        console.error('Failed to store exchange rate.', error);
        process.exitCode = 1;
    })
    .finally(() => {
        sqlite.close();
    });
