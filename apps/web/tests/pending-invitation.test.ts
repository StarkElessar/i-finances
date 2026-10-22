import { claimInvitationTokenFromAddress } from '@/features/invitation/model/claim-invitation-token';
import { parseInvitationLink } from '@/features/invitation/model/parse-invitation-link';
import {
	PENDING_INVITATION_STORAGE_KEY,
	type PendingInvitationStorage,
	PendingInvitationStore
} from '@/features/invitation/model/pending-invitation-store';

import { describe, expect, it, vi } from 'vitest';

const TOKEN = `${'aB3_-'.repeat(8)}xyz`;

const OTHER_TOKEN = `${'Zq9'.repeat(14)}z`;

function createMemoryStorage(): PendingInvitationStorage & { values: Map<string, string> } {
	const values = new Map<string, string>();

	return {
		getItem: (key) => values.get(key) ?? null,
		removeItem: (key) => {
			values.delete(key);
		},
		setItem: (key, value) => {
			values.set(key, value);
		},
		values
	};
}

function createBrokenStorage(): PendingInvitationStorage {
	const fail = () => {
		throw new DOMException('blocked', 'SecurityError');
	};

	return { getItem: fail, removeItem: fail, setItem: fail };
}

describe('test tokens', () => {
	it('are well-formed', () => {
		expect(TOKEN).toHaveLength(43);
		expect(OTHER_TOKEN).toHaveLength(43);
	});
});

describe('PendingInvitationStore', () => {
	it('keeps the token in the tab storage and gives it back', () => {
		const storage = createMemoryStorage();
		const store = new PendingInvitationStore(storage);

		expect(store.read()).toBeUndefined();
		expect(store.has()).toBe(false);

		store.save(TOKEN);

		expect(JSON.parse(storage.values.get(PENDING_INVITATION_STORAGE_KEY) ?? 'null')).toEqual({ token: TOKEN });
		expect(store.read()).toBe(TOKEN);
		expect(store.has()).toBe(true);

		// A second page of the same tab (the remount after the session reload) sees the same token.
		expect(new PendingInvitationStore(storage).read()).toBe(TOKEN);
	});

	it('forgets the token on clear', () => {
		const storage = createMemoryStorage();
		const store = new PendingInvitationStore(storage);

		store.save(TOKEN);
		store.clear();

		expect(store.read()).toBeUndefined();
		expect(storage.values.size).toBe(0);
	});

	it('replaces an older token with a newer one', () => {
		const store = new PendingInvitationStore(createMemoryStorage());

		store.save(TOKEN);
		store.save(OTHER_TOKEN);

		expect(store.read()).toBe(OTHER_TOKEN);
	});

	it('stores nothing that is not a well-formed token', () => {
		const storage = createMemoryStorage();
		const store = new PendingInvitationStore(storage);

		store.save('short');
		store.save(`${TOKEN}extra`);
		store.save('');

		expect(store.read()).toBeUndefined();
		expect(storage.values.size).toBe(0);
	});

	it('does not trust a stored value that is not a token', () => {
		const storage = createMemoryStorage();

		storage.setItem(PENDING_INVITATION_STORAGE_KEY, 'something else');

		expect(new PendingInvitationStore(storage).read()).toBeUndefined();
	});

	it('gives a guest\'s token to the first user who signs in, and from then on only to that user (review of U4)', () => {
		const storage = createMemoryStorage();
		const store = new PendingInvitationStore(storage);

		store.save(TOKEN);

		// The guest who opened the link signs in as Анна: the token is hers now.
		expect(store.read('anna')).toBe(TOKEN);
		expect(JSON.parse(storage.values.get(PENDING_INVITATION_STORAGE_KEY) ?? 'null')).toEqual({ token: TOKEN, userId: 'anna' });
		expect(new PendingInvitationStore(storage).read('anna')).toBe(TOKEN);

		// Анна's session ends: a guest at the keyboard sees nothing, the token waits for her.
		expect(store.read()).toBeUndefined();
		expect(store.has()).toBe(false);
		expect(store.read('anna')).toBe(TOKEN);
	});

	it('never gives a user\'s token to another user in the same tab, and forgets it', () => {
		const storage = createMemoryStorage();
		const store = new PendingInvitationStore(storage);

		store.save(TOKEN, 'anna');

		expect(store.has('boris')).toBe(false);
		expect(store.read('boris')).toBeUndefined();
		expect(storage.values.size).toBe(0);
		// Gone for Анна too: the tab has changed hands.
		expect(store.read('anna')).toBeUndefined();
	});

	it('binds the token to the user who saved it from the onboarding', () => {
		const store = new PendingInvitationStore(createMemoryStorage());

		store.save(TOKEN, 'anna');

		expect(store.read()).toBeUndefined();
		expect(store.read('anna')).toBe(TOKEN);
	});

	it('does not trust a stored entry of the wrong shape', () => {
		const storage = createMemoryStorage();

		storage.setItem(PENDING_INVITATION_STORAGE_KEY, JSON.stringify({ token: 'short', userId: 'anna' }));
		expect(new PendingInvitationStore(storage).read('anna')).toBeUndefined();

		storage.setItem(PENDING_INVITATION_STORAGE_KEY, TOKEN);
		expect(new PendingInvitationStore(storage).read()).toBeUndefined();
	});

	it('works from memory when the browser refuses storage', () => {
		const store = new PendingInvitationStore(createBrokenStorage());

		expect(store.read()).toBeUndefined();

		store.save(TOKEN);
		expect(store.read()).toBe(TOKEN);
		expect(store.read('anna')).toBe(TOKEN);
		expect(store.read('boris')).toBeUndefined();

		store.save(TOKEN);
		store.clear();
		expect(store.read()).toBeUndefined();
	});

	it('works with no storage at all', () => {
		const store = new PendingInvitationStore(undefined);

		store.save(TOKEN);
		expect(store.read()).toBe(TOKEN);
	});
});

describe('claimInvitationTokenFromAddress', () => {
	it('moves the token of the fragment to the store and cleans the address', () => {
		const store = new PendingInvitationStore(createMemoryStorage());
		const replaceAddress = vi.fn<(path: string) => void>();

		const token = claimInvitationTokenFromAddress({
			location: { hash: `#${TOKEN}`, pathname: '/invite' },
			replaceAddress,
			store
		});

		expect(token).toBe(TOKEN);
		expect(store.read()).toBe(TOKEN);
		expect(replaceAddress).toHaveBeenCalledExactlyOnceWith('/invite');
	});

	it('reads the trailing-slash form too and normalises the address', () => {
		const store = new PendingInvitationStore(createMemoryStorage());
		const replaceAddress = vi.fn<(path: string) => void>();

		expect(claimInvitationTokenFromAddress({
			location: { hash: `#${TOKEN}`, pathname: '/invite/' },
			replaceAddress,
			store
		})).toBe(TOKEN);
		expect(replaceAddress).toHaveBeenCalledExactlyOnceWith('/invite');
	});

	it('leaves a clean address and the stored token alone', () => {
		const store = new PendingInvitationStore(createMemoryStorage());
		const replaceAddress = vi.fn<(path: string) => void>();

		store.save(TOKEN);

		expect(claimInvitationTokenFromAddress({ location: { hash: '', pathname: '/invite' }, replaceAddress, store })).toBeUndefined();
		expect(replaceAddress).not.toHaveBeenCalled();
		expect(store.read()).toBe(TOKEN);
	});

	it('drops a fragment that is not a token from the address and stores nothing', () => {
		const store = new PendingInvitationStore(createMemoryStorage());
		const replaceAddress = vi.fn<(path: string) => void>();

		expect(claimInvitationTokenFromAddress({
			location: { hash: '#not-a-token', pathname: '/invite' },
			replaceAddress,
			store
		})).toBeUndefined();
		expect(replaceAddress).toHaveBeenCalledExactlyOnceWith('/invite');
		expect(store.read()).toBeUndefined();
	});

	it('does not read a token written into the path: such a link has already been logged', () => {
		const store = new PendingInvitationStore(createMemoryStorage());
		const replaceAddress = vi.fn<(path: string) => void>();

		expect(claimInvitationTokenFromAddress({
			location: { hash: '', pathname: `/invite/${TOKEN}` },
			replaceAddress,
			store
		})).toBeUndefined();
		expect(store.read()).toBeUndefined();
	});

	it('keeps an older stored token when the new fragment is not a token', () => {
		const store = new PendingInvitationStore(createMemoryStorage());

		store.save(TOKEN);
		claimInvitationTokenFromAddress({ location: { hash: '#junk', pathname: '/invite' }, replaceAddress: () => {}, store });

		expect(store.read()).toBe(TOKEN);
	});
});

describe('parseInvitationLink', () => {
	it.each([
		['a full link', `https://ifinances.example/invite#${TOKEN}`],
		['a link with a port', `http://localhost:5173/invite#${TOKEN}`],
		['a link without the scheme, as the board writes it', `ifinances.example/invite#${TOKEN}`],
		['the path alone', `/invite#${TOKEN}`],
		['the path with a trailing slash', `https://ifinances.example/invite/#${TOKEN}`],
		['the bare token', TOKEN],
		['a link with spaces around it', `  https://ifinances.example/invite#${TOKEN}\n`]
	])('reads the token from %s', (_name, input) => {
		expect(parseInvitationLink(input)).toBe(TOKEN);
	});

	it.each([
		['an empty field', ''],
		['spaces', '   '],
		['the board example', 'ifinances.example/invite#abc'],
		['a link with no fragment', 'https://ifinances.example/invite'],
		['a token in the path', `https://ifinances.example/invite/${TOKEN}`],
		['a token in the query', `https://ifinances.example/invite?token=${TOKEN}`],
		['another page', `https://ifinances.example/other#${TOKEN}`],
		['a too long token', `https://ifinances.example/invite#${TOKEN}x`],
		['plain words', 'пригласи меня пожалуйста'],
		['a scheme only', 'https://']
	])('reads nothing from %s', (_name, input) => {
		expect(parseInvitationLink(input)).toBeUndefined();
	});
});
