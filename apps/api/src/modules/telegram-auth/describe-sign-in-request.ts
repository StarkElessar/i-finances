import { parseUserAgent } from '@/modules/auth';

/**
 * «Safari, iOS» from the `User-Agent` of the browser that started the request. Only names from a fixed list come out
 * (`parseUserAgent`), so a crafted user agent cannot write its own text into the bot message. `undefined` when
 * nothing is recognised; the caller substitutes «неизвестное устройство».
 */
export function describeSignInDevice(userAgent: string | null): string | undefined {
	const { browser, os } = parseUserAgent(userAgent);
	const parts = [browser, os].filter((part) => part !== null);

	return parts.length === 0 ? undefined : parts.join(', ');
}

/** «18 октября, 21:04» in the given time zone: when the request was started. */
export function describeSignInMoment(moment: Date, timeZone: string): string {
	const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone }).format(moment);
	const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', hourCycle: 'h23', minute: '2-digit', timeZone }).format(moment);

	return `${day}, ${time}`;
}
