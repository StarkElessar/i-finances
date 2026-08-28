import {
	convertMinorUnitsByExchangeRate,
	type CurrencyCodeValue,
	invertExchangeRate
} from '~/shared/lib';

import type { ExchangeRateQuote } from '~/entities/exchange-rate';

import { TransferConversionAmountError } from './transfer-errors';

export const TRANSFER_EXCHANGE_RATE_SOURCE = 'transfer';

export type TransferLegRateSnapshot = {
	amountInHouseholdBaseCurrencyMinor: number;
	effectiveOn: string;
	rate: string;
	source: string;
};

export type TransferAmountPlan = {
	baseAmountMinor: number;
	fromLeg: TransferLegRateSnapshot;
	toAmountMinor: number;
	toLeg: TransferLegRateSnapshot;
};

/**
 * Builds credit amount and both ledger rate snapshots for a transfer.
 */
export function createTransferAmountPlan(input: {
	fromAmountMinor: number;
	fromCurrency: CurrencyCodeValue;
	happenedOn: string;
	householdBaseCurrency: CurrencyCodeValue;
	resolveForeignBaseQuote: () => Promise<ExchangeRateQuote>;
	toCurrency: CurrencyCodeValue;
	transferRate: string;
}): Promise<TransferAmountPlan> {
	const toAmountMinor = convertMinorUnitsByExchangeRate(
		input.fromAmountMinor,
		input.transferRate
	);

	if (toAmountMinor <= 0) {
		throw new TransferConversionAmountError();
	}

	return resolveBaseAmountPlan({
		fromAmountMinor: input.fromAmountMinor,
		fromCurrency: input.fromCurrency,
		happenedOn: input.happenedOn,
		householdBaseCurrency: input.householdBaseCurrency,
		resolveForeignBaseQuote: input.resolveForeignBaseQuote,
		toAmountMinor,
		toCurrency: input.toCurrency,
		transferRate: input.transferRate
	});
}

async function resolveBaseAmountPlan(input: {
	fromAmountMinor: number;
	fromCurrency: CurrencyCodeValue;
	happenedOn: string;
	householdBaseCurrency: CurrencyCodeValue;
	resolveForeignBaseQuote: () => Promise<ExchangeRateQuote>;
	toAmountMinor: number;
	toCurrency: CurrencyCodeValue;
	transferRate: string;
}): Promise<TransferAmountPlan> {
	if (input.toCurrency === input.householdBaseCurrency) {
		return {
			baseAmountMinor: input.toAmountMinor,
			fromLeg: {
				amountInHouseholdBaseCurrencyMinor: input.toAmountMinor,
				effectiveOn: input.happenedOn,
				rate: input.transferRate,
				source: TRANSFER_EXCHANGE_RATE_SOURCE
			},
			toAmountMinor: input.toAmountMinor,
			toLeg: createIdentityLeg(input.toAmountMinor, input.happenedOn)
		};
	}

	if (input.fromCurrency === input.householdBaseCurrency) {
		return {
			baseAmountMinor: input.fromAmountMinor,
			fromLeg: createIdentityLeg(input.fromAmountMinor, input.happenedOn),
			toAmountMinor: input.toAmountMinor,
			toLeg: {
				amountInHouseholdBaseCurrencyMinor: input.fromAmountMinor,
				effectiveOn: input.happenedOn,
				rate: invertExchangeRate(input.transferRate),
				source: TRANSFER_EXCHANGE_RATE_SOURCE
			}
		};
	}

	const quote = await input.resolveForeignBaseQuote();

	if (
		quote.fromCurrency !== input.fromCurrency
		|| quote.toCurrency !== input.householdBaseCurrency
	) {
		throw new Error('Exchange-rate resolver returned an unexpected pair.');
	}

	const baseAmountMinor = convertMinorUnitsByExchangeRate(
		input.fromAmountMinor,
		quote.rate
	);

	if (baseAmountMinor <= 0) {
		throw new TransferConversionAmountError();
	}

	return {
		baseAmountMinor,
		fromLeg: {
			amountInHouseholdBaseCurrencyMinor: baseAmountMinor,
			effectiveOn: quote.effectiveOn,
			rate: quote.rate,
			source: quote.source
		},
		toAmountMinor: input.toAmountMinor,
		toLeg: {
			amountInHouseholdBaseCurrencyMinor: baseAmountMinor,
			effectiveOn: input.happenedOn,
			rate: rateMappingAmountToTarget(input.toAmountMinor, baseAmountMinor),
			source: TRANSFER_EXCHANGE_RATE_SOURCE
		}
	};
}

function createIdentityLeg(
	amountMinor: number,
	happenedOn: string
): TransferLegRateSnapshot {
	return {
		amountInHouseholdBaseCurrencyMinor: amountMinor,
		effectiveOn: happenedOn,
		rate: '1',
		source: 'identity'
	};
}

/**
 * Builds rate R such that convertMinorUnitsByExchangeRate(amountMinor, R) ≈ targetMinor.
 */
function rateMappingAmountToTarget(
	amountMinor: number,
	targetMinor: number
): string {
	if (amountMinor <= 0 || targetMinor <= 0) {
		throw new TransferConversionAmountError();
	}

	const fractionDigits = 12;
	const scale = 10n ** BigInt(fractionDigits);
	const scaledRate = divideAndRound(
		BigInt(targetMinor) * scale,
		BigInt(amountMinor)
	);

	if (scaledRate <= 0n) {
		throw new TransferConversionAmountError();
	}

	const wholePart = scaledRate / scale;
	const fractionPart = (scaledRate % scale)
		.toString()
		.padStart(fractionDigits, '0')
		.replace(/0+$/, '');

	return fractionPart ? `${wholePart}.${fractionPart}` : wholePart.toString();
}

function divideAndRound(numerator: bigint, denominator: bigint): bigint {
	const quotient = numerator / denominator;
	const remainder = numerator % denominator;

	return remainder * 2n >= denominator ? quotient + 1n : quotient;
}
