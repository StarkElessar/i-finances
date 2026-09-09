import { db, sqlite } from '@/infrastructure/database/client';
import {
	ExchangeRateRepository,
	ExchangeRateService,
	normalizeExchangeRate
} from '@/modules/exchange-rate';

import { currencyCodeSchema } from '@i-finances/contracts';
import { z } from 'zod';

const ALLOWED_OPTIONS = new Set([
	'date',
	'from',
	'rate',
	'source',
	'to'
]);

const LOCAL_DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidLocalDateKey(value: string): boolean {
	const match = LOCAL_DATE_KEY_PATTERN.exec(value);

	if (match === null) {
		return false;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));

	return date.getUTCFullYear() === year
		&& date.getUTCMonth() === month - 1
		&& date.getUTCDate() === day;
}

const upsertExchangeRateOptionsSchema = z.object({
	effectiveOn: z.string()
		.regex(LOCAL_DATE_KEY_PATTERN, 'Use the YYYY-MM-DD date format.')
		.refine(isValidLocalDateKey, 'Exchange-rate date does not exist.'),
	fromCurrency: currencyCodeSchema,
	rate: z.string().transform((value, context) => {
		const normalizedRate = normalizeExchangeRate(value);

		if (normalizedRate !== undefined) {
			return normalizedRate;
		}

		context.addIssue({
			code: 'custom',
			message: 'Exchange rate must be a positive decimal value.'
		});

		return z.NEVER;
	}),
	source: z.string().trim().min(1).max(64),
	toCurrency: currencyCodeSchema
}).refine(
	(input) => input.fromCurrency !== input.toCurrency,
	{
		message: 'Stored exchange-rate currencies must be different.',
		path: ['toCurrency']
	}
);

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
	const input = upsertExchangeRateOptionsSchema.parse({
		effectiveOn: options.date,
		fromCurrency: options.from,
		rate: options.rate,
		source: options.source ?? 'manual',
		toCurrency: options.to
	});
	const service = new ExchangeRateService(new ExchangeRateRepository(db));

	await service.upsert(input);

	console.warn(
		`Stored ${input.fromCurrency}/${input.toCurrency}`
		+ ` rate ${input.rate} for ${input.effectiveOn}`
		+ ` from "${input.source}".`
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
