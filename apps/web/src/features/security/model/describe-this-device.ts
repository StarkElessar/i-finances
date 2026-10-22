const MAX_DEVICE_NAME_LENGTH = 100;

function readBrowser(userAgent: string): string | null {
	// Order matters: Edge and Opera also say Chrome, Chrome on iOS says Safari.
	if (/\b(?:Edg|EdgA|EdgiOS)\//.test(userAgent)) {
		return 'Edge';
	}

	if (/\b(?:OPR|Opera)\//.test(userAgent)) {
		return 'Opera';
	}

	if (/\b(?:Firefox|FxiOS)\//.test(userAgent)) {
		return 'Firefox';
	}

	if (/\b(?:Chrome|CriOS)\//.test(userAgent)) {
		return 'Chrome';
	}

	if (/\bSafari\//.test(userAgent)) {
		return 'Safari';
	}

	return null;
}

function readSystem(userAgent: string): string | null {
	if (/iPhone|iPad|iPod/.test(userAgent)) {
		return 'iOS';
	}

	if (/Android/.test(userAgent)) {
		return 'Android';
	}

	if (/Windows/.test(userAgent)) {
		return 'Windows';
	}

	if (/Macintosh|Mac OS X/.test(userAgent)) {
		return 'macOS';
	}

	if (/Linux|X11/.test(userAgent)) {
		return 'Linux';
	}

	return null;
}

/**
 * The name a new passkey gets in the list: the browser and the system of this device («Safari · iOS»), the same way the
 * session list names them. `undefined` when neither is known, so the server keeps no name rather than a made-up one.
 */
export function describeThisDevice(userAgent: string): string | undefined {
	const parts = [readBrowser(userAgent), readSystem(userAgent)].filter((part): part is string => part !== null);

	return parts.length === 0 ? undefined : parts.join(' · ').slice(0, MAX_DEVICE_NAME_LENGTH);
}
