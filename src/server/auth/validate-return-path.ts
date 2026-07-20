const DEFAULT_RETURN_PATH = '/';

/**
 * Accepts only same-origin application paths for post-authentication redirects.
 */
export function validateReturnPath(candidate: string | null | undefined): string {
    if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
        return DEFAULT_RETURN_PATH;
    }

    try {
        const parsedUrl = new URL(candidate, 'http://internal.local');

        if (parsedUrl.origin !== 'http://internal.local' || parsedUrl.pathname === '/sign-in') {
            return DEFAULT_RETURN_PATH;
        }

        return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }
    catch {
        return DEFAULT_RETURN_PATH;
    }
}
