import { isIP } from 'node:net';

/** HTTP has validated the address; only the address counter groups IPv6 sources into /64 networks. */
export function loginAddressKey(ipAddress: string | undefined): string | undefined {
	if (ipAddress === undefined || isIP(ipAddress) !== 6) {
		return ipAddress;
	}

	const address = ipAddress.split('%')[0];
	const halves = address.split('::');
	const left = halves[0];
	const right = halves.at(1);
	const head = left === '' ? [] : left.split(':');
	const tail = right === undefined || right === '' ? [] : right.split(':');
	// A dotted IPv4 tail occupies two hextets; it can never be part of the first four.
	const extraTailWord = address.includes('.') ? 1 : 0;
	const words = right === undefined
		? head
		: [...head, ...Array<string>(8 - head.length - tail.length - extraTailWord).fill('0'), ...tail];

	return `${words.slice(0, 4).map((word) => Number.parseInt(word, 16).toString(16)).join(':')}::/64`;
}
