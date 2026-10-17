export type ParsedUserAgent = {
	browser: string | null;
	os: string | null;
};

type UserAgentRule = {
	name: string;
	pattern: RegExp;
};

/**
 * Order matters: many browsers announce themselves as Chrome and Safari too,
 * so the more specific tokens come first.
 */
const BROWSER_RULES: readonly UserAgentRule[] = [
	{ name: 'Edge', pattern: /\b(?:Edg|EdgA|EdgiOS|Edge)\// },
	{ name: 'Opera', pattern: /\b(?:OPR|Opera|OPT)\// },
	{ name: 'Yandex Browser', pattern: /\bYaBrowser\// },
	{ name: 'Samsung Internet', pattern: /\bSamsungBrowser\// },
	{ name: 'Firefox', pattern: /\b(?:Firefox|FxiOS)\// },
	{ name: 'Chrome', pattern: /\b(?:Chrome|CriOS|Chromium)\// },
	{ name: 'Safari', pattern: /\bSafari\// }
];

/**
 * Order matters: Android user agents also contain "Linux", and iOS ones
 * contain "like Mac OS X".
 */
const OS_RULES: readonly UserAgentRule[] = [
	{ name: 'Android', pattern: /\bAndroid\b/ },
	{ name: 'iOS', pattern: /\b(?:iPhone|iPad|iPod)\b/ },
	{ name: 'Windows', pattern: /\bWindows\b/ },
	{ name: 'macOS', pattern: /\bMacintosh\b|\bMac OS X\b/ },
	{ name: 'Chrome OS', pattern: /\bCrOS\b/ },
	{ name: 'Linux', pattern: /\bLinux\b|\bX11\b/ }
];

function matchRule(rules: readonly UserAgentRule[], userAgent: string): string | null {
	return rules.find((rule) => rule.pattern.test(userAgent))?.name ?? null;
}

/**
 * Extracts a human-readable browser and operating system from a user agent
 * with a short list of rules. Not a general-purpose parser: it is only used
 * to let people recognize their own sessions, never for access decisions.
 */
export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
	if (userAgent === null || userAgent === undefined || userAgent.length === 0) {
		return { browser: null, os: null };
	}

	return {
		browser: matchRule(BROWSER_RULES, userAgent),
		os: matchRule(OS_RULES, userAgent)
	};
}
