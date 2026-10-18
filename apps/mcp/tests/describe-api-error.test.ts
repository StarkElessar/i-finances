import { ApiRequestError } from '@/api-request-error';
import { describeApiError, MCP_HOUSEHOLD_REQUIRED_MESSAGE } from '@/describe-api-error';

import { describe, expect, it } from 'vitest';

describe('describeApiError', () => {
	it('explains household-required as a server setup problem of MCP_USER_ID', () => {
		const error = new ApiRequestError(403, {
			errorCode: 'household-required',
			message: 'Вы пока не состоите в окружении.',
			ok: false
		});

		expect(describeApiError(error)).toBe(MCP_HOUSEHOLD_REQUIRED_MESSAGE);
		expect(MCP_HOUSEHOLD_REQUIRED_MESSAGE).toContain('MCP_USER_ID');
	});

	it('keeps the API message for other failures, including other 403s', () => {
		expect(describeApiError(new ApiRequestError(403, {
			errorCode: 'forbidden',
			message: 'Недопустимый источник запроса.',
			ok: false
		}))).toBe('Недопустимый источник запроса.');
		expect(describeApiError(new ApiRequestError(500, undefined))).toBe('API request failed with status 500');
		expect(describeApiError(new Error('boom'))).toBe('boom');
	});
});
