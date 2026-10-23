import { subscribeToApiAccessFailures } from '@/shared/api';

import { HouseholdClient } from '@/features/household/api/household-client';
import { HouseholdInvitationClient } from '@/features/household/api/household-invitation-client';
import { createHousehold, DEFAULT_HOUSEHOLD_NAME } from '@/features/household/model/create-household';
import { availableWelcomeChoice, NOT_AN_INVITATION_MESSAGE, readWelcomeForm } from '@/features/household/model/read-welcome-form';
import { InvitationClient } from '@/features/invitation/api/invitation-client';
import { parseInvitationLink } from '@/features/invitation/model/parse-invitation-link';

import {
	HOUSEHOLD_CREATION_NOT_ALLOWED_ERROR_CODE,
	HOUSEHOLD_CREATION_NOT_ALLOWED_MESSAGE,
	type HouseholdDetails
} from '@i-finances/contracts';
import { describe, expect, it, vi } from 'vitest';

const TOKEN = `${'aB3_-'.repeat(8)}xyz`;

const CREATED: HouseholdDetails = {
	baseCurrency: 'BYN',
	id: 'household-1',
	members: [{ displayName: 'Анна', joinedAt: '2026-10-18T18:04:00.000Z', role: 'owner', telegramUsername: 'anna', userId: 'user-1' }],
	name: 'Семья',
	role: 'owner'
};

describe('readWelcomeForm', () => {
	it('lets a person with a name create a household', () => {
		expect(readWelcomeForm({ choice: 'create', displayName: ' Анна ', link: '' }, parseInvitationLink))
			.toEqual({ canContinue: true, displayName: 'Анна', displayNameError: undefined });
	});

	it('does not continue without a name and says so', () => {
		const form = readWelcomeForm({ choice: 'create', displayName: '   ', link: '' }, parseInvitationLink);

		expect(form.canContinue).toBe(false);
		expect(form.displayNameError).toBe('Введите имя.');
	});

	it('does not accept a name of more than 100 characters', () => {
		const form = readWelcomeForm({ choice: 'create', displayName: 'я'.repeat(101), link: '' }, parseInvitationLink);

		expect(form.canContinue).toBe(false);
		expect(form.displayNameError).toBe('Имя слишком длинное.');
	});

	it('waits for a link when the person has an invitation, without a complaint about an empty field', () => {
		const form = readWelcomeForm({ choice: 'invite', displayName: 'Анна', link: '' }, parseInvitationLink);

		expect(form.canContinue).toBe(false);
		expect(form.linkError).toBeUndefined();
	});

	it('reads the token of a pasted link', () => {
		const link = `https://ifinances.example/invite#${TOKEN}`;
		const form = readWelcomeForm({ choice: 'invite', displayName: 'Анна', link }, parseInvitationLink);

		expect(form).toMatchObject({ canContinue: true, linkError: undefined, token: TOKEN });
	});

	it('says a link without a token is not an invitation, as the board does', () => {
		const form = readWelcomeForm({ choice: 'invite', displayName: 'Анна', link: 'ifinances.example/invite#abc' }, parseInvitationLink);

		expect(form.canContinue).toBe(false);
		expect(form.linkError).toBe(NOT_AN_INVITATION_MESSAGE);
		expect(form.token).toBeUndefined();
	});

	it('ignores the link while the person creates a household', () => {
		const form = readWelcomeForm({ choice: 'create', displayName: 'Анна', link: 'garbage' }, parseInvitationLink);

		expect(form.canContinue).toBe(true);
		expect(form.linkError).toBeUndefined();
	});
});

describe('createHousehold', () => {
	it('creates the household and gives the summary for the viewer', async () => {
		const gateway = { create: vi.fn().mockResolvedValue({ household: CREATED, ok: true }) };

		await expect(createHousehold(gateway, '  Семья ')).resolves.toEqual({
			household: { id: 'household-1', name: 'Семья', role: 'owner' },
			kind: 'created'
		});
		expect(gateway.create).toHaveBeenCalledExactlyOnceWith('Семья');
	});

	it('proposes «Семья» by default', () => {
		expect(DEFAULT_HOUSEHOLD_NAME).toBe('Семья');
	});

	it('does not send an empty name', async () => {
		const gateway = { create: vi.fn() };

		await expect(createHousehold(gateway, '  ')).resolves.toEqual({ kind: 'invalid-name', message: 'Введите название окружения.' });
		expect(gateway.create).not.toHaveBeenCalled();
	});

	it('does not send a name over the limit', async () => {
		const gateway = { create: vi.fn() };

		await expect(createHousehold(gateway, 'я'.repeat(121))).resolves.toMatchObject({ kind: 'invalid-name' });
		expect(gateway.create).not.toHaveBeenCalled();
	});

	it('takes the field message of the server for an invalid name', async () => {
		const gateway = {
			create: vi.fn().mockResolvedValue({
				errorCode: 'invalid-input',
				fieldErrors: { name: 'Название окружения слишком длинное.' },
				message: 'Проверьте название окружения.',
				ok: false
			})
		};

		await expect(createHousehold(gateway, 'Семья')).resolves.toEqual({
			kind: 'invalid-name',
			message: 'Название окружения слишком длинное.'
		});
	});

	it('reports 409 already-in-household so that the page can take the household from the session', async () => {
		const gateway = {
			create: vi.fn().mockResolvedValue({ errorCode: 'already-in-household', message: 'Вы уже состоите в окружении.', ok: false })
		};

		await expect(createHousehold(gateway, 'Семья')).resolves.toEqual({ kind: 'already-in-household' });
	});

	it('gives the board message for a network failure', async () => {
		const gateway = { create: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) };

		await expect(createHousehold(gateway, 'Семья')).resolves.toEqual({
			kind: 'failed',
			message: 'Не удалось создать окружение. Проверьте соединение и повторите.'
		});
	});

	it('gives the message of the server for any other refusal', async () => {
		const gateway = {
			create: vi.fn().mockResolvedValue({ errorCode: 'unexpected', message: 'Не удалось выполнить действие.', ok: false })
		};

		await expect(createHousehold(gateway, 'Семья')).resolves.toEqual({ kind: 'failed', message: 'Не удалось выполнить действие.' });
	});

	it('shows the server text when the person may not found a household', async () => {
		const gateway = {
			create: vi.fn().mockResolvedValue({
				errorCode: HOUSEHOLD_CREATION_NOT_ALLOWED_ERROR_CODE,
				message: HOUSEHOLD_CREATION_NOT_ALLOWED_MESSAGE,
				ok: false
			})
		};

		await expect(createHousehold(gateway, 'Семья'))
			.resolves.toEqual({ kind: 'failed', message: HOUSEHOLD_CREATION_NOT_ALLOWED_MESSAGE });
	});
});

describe('availableWelcomeChoice', () => {
	it('keeps the choice of a person who may found a household and leaves only the invitation to anybody else', () => {
		expect(availableWelcomeChoice('create', true)).toBe('create');
		expect(availableWelcomeChoice('invite', true)).toBe('invite');
		expect(availableWelcomeChoice('create', false)).toBe('invite');
		expect(availableWelcomeChoice('invite', false)).toBe('invite');
	});
});

type Call = { body: unknown; method: string; url: string };

function createFetcher(status: number, body: unknown, calls: Call[]): typeof globalThis.fetch {
	return async (input, init) => {
		calls.push({
			body: typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined,
			method: init?.method ?? 'GET',
			url: typeof input === 'string' ? input : 'unexpected-request-input'
		});

		return new Response(JSON.stringify(body), { status });
	};
}

describe('HouseholdClient', () => {
	it('creates a household with POST /api/household', async () => {
		const calls: Call[] = [];
		const client = new HouseholdClient({ fetcher: createFetcher(201, { household: CREATED, ok: true }, calls) });

		await expect(client.create('Семья')).resolves.toMatchObject({ ok: true });
		expect(calls).toEqual([{ body: { name: 'Семья' }, method: 'POST', url: '/api/household' }]);
	});

	it('returns 403 household-creation-not-allowed as a value, not as an access failure', async () => {
		const failures: string[] = [];
		const unsubscribe = subscribeToApiAccessFailures((failure) => failures.push(failure));
		const client = new HouseholdClient({
			fetcher: createFetcher(403, {
				errorCode: HOUSEHOLD_CREATION_NOT_ALLOWED_ERROR_CODE,
				message: HOUSEHOLD_CREATION_NOT_ALLOWED_MESSAGE,
				ok: false
			}, [])
		});

		try {
			await expect(client.create('Семья')).resolves.toMatchObject({ errorCode: 'household-creation-not-allowed', ok: false });
			expect(failures).toEqual([]);
		}
		finally {
			unsubscribe();
		}
	});

	it('returns 409 already-in-household as a value', async () => {
		const client = new HouseholdClient({
			fetcher: createFetcher(409, { errorCode: 'already-in-household', message: 'Вы уже состоите в окружении.', ok: false }, [])
		});

		await expect(client.create('Семья')).resolves.toMatchObject({ errorCode: 'already-in-household', ok: false });
	});

	it('removes a member and leaves with the documented routes', async () => {
		const calls: Call[] = [];
		const removeClient = new HouseholdClient({ fetcher: createFetcher(200, { household: CREATED, ok: true }, calls) });
		const leaveClient = new HouseholdClient({ fetcher: createFetcher(200, { ok: true }, calls) });

		await removeClient.removeMember('user/2');
		await leaveClient.leave();

		expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
			'POST /api/household/members/user%2F2/remove',
			'POST /api/household/leave'
		]);
	});

	it('returns 409 last-owner as a value', async () => {
		const client = new HouseholdClient({
			fetcher: createFetcher(409, { errorCode: 'last-owner', message: 'Вы единственный владелец окружения.', ok: false }, [])
		});

		await expect(client.leave()).resolves.toMatchObject({ errorCode: 'last-owner', ok: false });
	});

	it('still throws what is not a contract answer', async () => {
		const client = new HouseholdClient({ fetcher: createFetcher(502, 'Bad gateway', []) });

		await expect(client.get()).rejects.toMatchObject({ status: 502 });
	});
});

describe('HouseholdInvitationClient', () => {
	it('uses the documented routes', async () => {
		const calls: Call[] = [];
		const link = `https://ifinances.example/invite#${TOKEN}`;
		const created = { invitation: { expiresAt: '2026-10-25T18:04:00.000Z', id: 'invitation-1', link }, ok: true };
		const createClient = new HouseholdInvitationClient({ fetcher: createFetcher(201, created, calls) });
		const listClient = new HouseholdInvitationClient({ fetcher: createFetcher(200, { invitations: [], ok: true }, calls) });
		const revokeClient = new HouseholdInvitationClient({ fetcher: createFetcher(200, { ok: true }, calls) });

		await createClient.create();
		await listClient.list();
		await revokeClient.revoke('invitation/1');

		expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
			'POST /api/household/invitations',
			'GET /api/household/invitations',
			'POST /api/household/invitations/invitation%2F1/revoke'
		]);
	});

	it('returns the limit of three active invitations as a value', async () => {
		const client = new HouseholdInvitationClient({
			fetcher: createFetcher(409, { errorCode: 'invitation-limit-reached', message: 'Уже есть 3 активных.', ok: false }, [])
		});

		await expect(client.create()).resolves.toMatchObject({ errorCode: 'invitation-limit-reached', ok: false });
	});
});

describe('InvitationClient', () => {
	it('sends the token in the body only, never in the address', async () => {
		const calls: Call[] = [];
		const preview = new InvitationClient({
			fetcher: createFetcher(200, {
				invitation: { expiresAt: '2026-10-25T18:04:00.000Z', householdName: 'Семья', inviterName: 'Сергей' },
				ok: true
			}, calls)
		});
		const accept = new InvitationClient({
			fetcher: createFetcher(200, { household: { id: 'household-1', name: 'Семья', role: 'member' }, ok: true }, calls)
		});

		await preview.preview(TOKEN);
		await accept.accept(TOKEN, true);

		expect(calls).toEqual([
			{ body: { token: TOKEN }, method: 'POST', url: '/api/invitations/preview' },
			{ body: { replaceEmptyHousehold: true, token: TOKEN }, method: 'POST', url: '/api/invitations/accept' }
		]);
		expect(calls.every((call) => !call.url.includes(TOKEN))).toBe(true);
	});

	it('returns a dead link with its reason as a value', async () => {
		const client = new InvitationClient({
			fetcher: createFetcher(404, {
				errorCode: 'invitation-unavailable',
				message: 'Ссылка приглашения недействительна.',
				ok: false,
				reason: 'revoked'
			}, [])
		});

		await expect(client.preview(TOKEN)).resolves.toMatchObject({ errorCode: 'invitation-unavailable', ok: false, reason: 'revoked' });
	});

	it('returns the consent request with the name of the own household as a value', async () => {
		const client = new InvitationClient({
			fetcher: createFetcher(409, {
				currentHousehold: { name: 'Дом' },
				errorCode: 'empty-household-confirmation-required',
				message: 'Ваше пустое окружение будет удалено, и вы перейдёте по приглашению.',
				ok: false
			}, [])
		});

		await expect(client.accept(TOKEN, false)).resolves.toMatchObject({
			currentHousehold: { name: 'Дом' },
			errorCode: 'empty-household-confirmation-required'
		});
	});

	it('returns 429 as a value', async () => {
		const client = new InvitationClient({
			fetcher: createFetcher(429, { errorCode: 'rate-limited', message: 'Слишком много попыток. Попробуйте позже.', ok: false }, [])
		});

		await expect(client.preview(TOKEN)).resolves.toMatchObject({ errorCode: 'rate-limited', ok: false });
	});
});
