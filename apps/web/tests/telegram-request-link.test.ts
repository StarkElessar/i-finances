import { isTelegramBotUrl } from '@/features/telegram-request';

import { describe, expect, it } from 'vitest';

describe('isTelegramBotUrl', () => {
	it.each([
		'https://t.me/i_finances_bot?start=abc',
		'HTTPS://T.ME/i_finances_bot?start=abc',
		'https://t.me:443/i_finances_bot?start=abc',
		'https://t.me/i_finances_bot'
	])('accepts %s', (value) => {
		expect(isTelegramBotUrl(value)).toBe(true);
	});

	it.each([
		['another host', 'https://evil.example/?start=abc'],
		['plain http', 'http://t.me/i_finances_bot'],
		['javascript:', 'javascript:alert(1)'],
		['javascript: that mentions t.me', 'javascript:alert(1)//https://t.me/i_finances_bot'],
		['data:', 'data:text/html,<script>alert(1)</script>'],
		['tg: (the app link is not a button link)', 'tg://resolve?domain=i_finances_bot&start=abc'],
		['a subdomain look-alike', 'https://t.me.evil.example/x'],
		['a host that ends like it', 'https://evilt.me/x'],
		['a subdomain of it', 'https://www.t.me/x'],
		['t.me as the user name of another host', 'https://t.me@evil.example/x'],
		['a user name', 'https://user@t.me/x'],
		['a user name and a password', 'https://user:secret@t.me/x'],
		['a port', 'https://t.me:8443/x'],
		['a backslash that hides another host', 'https://evil.example\\@t.me/x'],
		['a Cyrillic look-alike host', 'https://т.me/x'],
		['the trailing-dot form of the host', 'https://t.me./x'],
		['a relative link', '//t.me/x'],
		['not a link at all', 'not a link']
	])('refuses %s', (_name, value) => {
		expect(isTelegramBotUrl(value)).toBe(false);
	});
});
