import { INVITATION_TOKEN_PATTERN, readInvitationTokenFromLocation } from '@i-finances/contracts';

/** A host that cannot exist, only to let `URL` read a link written without an address (`/invite#…`). */
const PLACEHOLDER_ORIGIN = 'https://link.invalid';

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function toUrl(text: string): URL | undefined {
	let address = `https://${text}`;

	if (SCHEME_PATTERN.test(text)) {
		address = text;
	}
	else if (text.startsWith('/')) {
		address = `${PLACEHOLDER_ORIGIN}${text}`;
	}

	try {
		return new URL(address);
	}
	catch {
		return undefined;
	}
}

/**
 * The token of what a person pasted into the field «Ссылка-приглашение» of the onboarding: a whole link
 * (`https://host/invite#<token>`), a link without the scheme (`host/invite#<token>`), the path (`/invite#<token>`) or
 * the bare token. Only the fragment form of the link counts, as everywhere (`readInvitationTokenFromLocation`); the host
 * is not checked, the server decides whether the token opens anything.
 *
 * Returns `undefined` for anything else. Never throws and never reports what it was given.
 */
export function parseInvitationLink(input: string): string | undefined {
	const text = input.trim();

	if (text === '') {
		return undefined;
	}

	if (INVITATION_TOKEN_PATTERN.test(text)) {
		return text;
	}

	const url = toUrl(text);

	return url === undefined ? undefined : readInvitationTokenFromLocation({ hash: url.hash, pathname: url.pathname });
}
