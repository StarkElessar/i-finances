export abstract class CurrencyCode {
    static readonly BYN = 'BYN' as const;

    static readonly USD = 'USD' as const;

    static readonly EUR = 'EUR' as const;

    static values(): CurrencyCodeValue[] {
        return [...CURRENCY_CODES];
    }

    static isCurrencyCode(value: string): value is CurrencyCodeValue {
        return CURRENCY_CODES.includes(value as CurrencyCodeValue);
    }
}

export const CURRENCY_CODES = [
    CurrencyCode.BYN,
    CurrencyCode.USD,
    CurrencyCode.EUR
] as const;

export type CurrencyCodeValue = typeof CURRENCY_CODES[number];
