export function validateReturnPath(value: string | undefined): string {
	if (value === undefined || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
		return '/';
	}

	try {
		const path = new URL(value, 'http://localhost').pathname;

		return path === '/sign-in' ? '/' : value;
	}
	catch {
		return '/';
	}
}
