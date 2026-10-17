import { hasUsablePassword, parseUserAgent } from '@/modules/auth';

import { describe, expect, it } from 'vitest';

describe('parseUserAgent', () => {
	it.each([
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
			'Chrome',
			'Windows'
		],
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
			+ 'Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
			'Edge',
			'Windows'
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
			'Safari',
			'macOS'
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
			'Firefox',
			'macOS'
		],
		[
			'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
			'Chrome',
			'Android'
		],
		[
			'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) '
			+ 'SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
			'Samsung Internet',
			'Android'
		],
		[
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) '
			+ 'CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
			'Chrome',
			'iOS'
		],
		[
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 YaBrowser/24.6.0.0 Safari/537.36',
			'Yandex Browser',
			'Linux'
		],
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
			'Opera',
			'Windows'
		]
	])('recognizes %s', (userAgent, browser, os) => {
		expect(parseUserAgent(userAgent)).toEqual({ browser, os });
	});

	it('returns nulls for missing or unknown user agents', () => {
		expect(parseUserAgent(null)).toEqual({ browser: null, os: null });
		expect(parseUserAgent(undefined)).toEqual({ browser: null, os: null });
		expect(parseUserAgent('')).toEqual({ browser: null, os: null });
		expect(parseUserAgent('curl/8.6.0')).toEqual({ browser: null, os: null });
	});
});

describe('hasUsablePassword', () => {
	it('accepts only Argon2 hashes', () => {
		expect(hasUsablePassword('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA')).toBe(true);
		expect(hasUsablePassword('')).toBe(false);
		expect(hasUsablePassword('!')).toBe(false);
		expect(hasUsablePassword('stored-hash')).toBe(false);
	});
});
