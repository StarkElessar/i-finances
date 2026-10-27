import { saveDisplayName } from '@/features/auth/model/save-display-name';

import type { UpdateDisplayNameResult } from '@i-finances/contracts';
import { describe, expect, it, vi } from 'vitest';

describe('saveDisplayName before joining or creating a household', () => {
	it.each(['', '   ', 'a'.repeat(101)])('rejects an invalid name before any request', async (displayName) => {
		const gateway = { updateDisplayName: vi.fn() };

		await expect(saveDisplayName(gateway, displayName, 'Анна')).resolves.toMatchObject({ kind: 'invalid-name' });
		expect(gateway.updateDisplayName).not.toHaveBeenCalled();
	});

	it('saves the trimmed name', async () => {
		const gateway = { updateDisplayName: vi.fn(async (): Promise<UpdateDisplayNameResult> => ({ displayName: 'Анна', ok: true })) };

		await expect(saveDisplayName(gateway, '  Анна  ', 'Anna')).resolves.toEqual({ displayName: 'Анна', kind: 'saved' });
		expect(gateway.updateDisplayName).toHaveBeenCalledExactlyOnceWith('Анна');
	});

	it('confirms an unchanged name without a request', async () => {
		const gateway = { updateDisplayName: vi.fn() };

		await expect(saveDisplayName(gateway, ' Анна ', 'Анна')).resolves.toEqual({ displayName: 'Анна', kind: 'saved' });
		expect(gateway.updateDisplayName).not.toHaveBeenCalled();
	});

	it('returns a server refusal so the caller stops before the household action', async () => {
		const gateway = {
			updateDisplayName: vi.fn(async (): Promise<UpdateDisplayNameResult> => ({
				errorCode: 'unauthenticated', message: 'Сессия истекла. Войдите заново.', ok: false
			}))
		};

		await expect(saveDisplayName(gateway, 'Анна', 'Anna')).resolves.toEqual({
			kind: 'failed', message: 'Сессия истекла. Войдите заново.'
		});
	});

	it('turns a network failure into a retryable error', async () => {
		const gateway = { updateDisplayName: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) };

		await expect(saveDisplayName(gateway, 'Анна', 'Anna')).resolves.toEqual({
			kind: 'failed', message: 'Не удалось сохранить имя. Попробуйте ещё раз.'
		});
	});
});
