import { isIP } from 'node:net';

import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

import type { ApiEnvironment } from './types';

const IPV4_MAPPED_PREFIX = '::ffff:';

export type ClientIpInput = {
	/** Raw `X-Forwarded-For` header value, if any. */
	forwardedFor?: string | null;
	/** Address of the TCP peer that opened the connection to this process. */
	socketAddress?: string;
	/** How many reverse proxies we own between the internet and this process. */
	trustedProxyCount: number;
};

function normalizeAddress(value: string | undefined): string | undefined {
	const candidate = value?.trim().toLowerCase();

	if (candidate === undefined || isIP(candidate) === 0) {
		return undefined;
	}

	if (candidate.startsWith(IPV4_MAPPED_PREFIX) && isIP(candidate.slice(IPV4_MAPPED_PREFIX.length)) === 4) {
		return candidate.slice(IPV4_MAPPED_PREFIX.length);
	}

	return candidate;
}

/**
 * Resolves the address of the real client.
 *
 * `X-Forwarded-For` is only trustworthy from the right: every proxy we own appends the address of its own peer to the
 * end of the list, while everything to the left is whatever the client chose to send. With `trustedProxyCount = N`,
 * the client is the N-th element from the right. With 0 (the default) no header is trusted and the TCP peer is used.
 *
 * Whenever the header cannot be used (missing, shorter than the proxy chain, not an IP address) the TCP peer is
 * returned instead, which the client cannot forge. Returns `undefined` only when nothing is known.
 */
export function resolveClientIp(input: ClientIpInput): string | undefined {
	const socketAddress = normalizeAddress(input.socketAddress);

	if (input.trustedProxyCount <= 0 || input.forwardedFor === undefined || input.forwardedFor === null) {
		return socketAddress;
	}

	const forwardedAddresses = input.forwardedFor.split(',');
	const forwardedAddress = normalizeAddress(forwardedAddresses[forwardedAddresses.length - input.trustedProxyCount]);

	return forwardedAddress ?? socketAddress;
}

function readSocketAddress(context: Context<ApiEnvironment>): string | undefined {
	try {
		return getConnInfo(context).remote.address;
	}
	catch {
		// No node server behind the context (for example `app.request()` in tests).
		return undefined;
	}
}

export function readClientIp(context: Context<ApiEnvironment>, trustedProxyCount: number): string | undefined {
	return resolveClientIp({
		forwardedFor: context.req.header('x-forwarded-for'),
		socketAddress: readSocketAddress(context),
		trustedProxyCount
	});
}
