import { CurrencyCode, type CurrencyCodeValue } from './currency-code';

export const BELARUSIAN_RUBLE_SYMBOL = '\u0411\u0336';

export const CURRENCY_SYMBOLS = {
    [CurrencyCode.BYN]: BELARUSIAN_RUBLE_SYMBOL,
    [CurrencyCode.USD]: '$',
    [CurrencyCode.EUR]: '€'
} as const satisfies Record<CurrencyCodeValue, string>;

export type CurrencyDisplay = 'symbol' | 'code';

export type FormatCurrencyOptions = Omit<Intl.NumberFormatOptions, 'style' | 'currency' | 'currencyDisplay'> & {
    locale?: string | string[];
    currencyDisplay?: CurrencyDisplay;
};

const DEFAULT_FRACTION_DIGITS = 2;

export function getCurrencySymbol(currency: CurrencyCodeValue): string {
    return CURRENCY_SYMBOLS[currency];
}

export function formatCurrency(amount: number, currency: CurrencyCodeValue, options: FormatCurrencyOptions = {}): string {
    const {
        locale = 'ru-BY',
        currencyDisplay = 'symbol',
        minimumFractionDigits,
        maximumFractionDigits,
        ...numberFormatOptions
    } = options;

    const resolvedMinimumFractionDigits = minimumFractionDigits
        ?? Math.min(DEFAULT_FRACTION_DIGITS, maximumFractionDigits ?? DEFAULT_FRACTION_DIGITS);

    const resolvedMaximumFractionDigits = maximumFractionDigits ?? Math.max(DEFAULT_FRACTION_DIGITS, resolvedMinimumFractionDigits);

    const numberFormat = new Intl.NumberFormat(locale, {
        ...numberFormatOptions,
        currency,
        currencyDisplay,
        minimumFractionDigits: resolvedMinimumFractionDigits,
        maximumFractionDigits: resolvedMaximumFractionDigits,
        style: 'currency'
    });

    return numberFormat
        .formatToParts(amount)
        .map((part) => {
            if (part.type === 'currency' && currencyDisplay === 'symbol') {
                return getCurrencySymbol(currency);
            }

            return part.value;
        })
        .join('');
}
