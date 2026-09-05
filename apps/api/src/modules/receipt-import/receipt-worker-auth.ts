import { createHash, timingSafeEqual } from 'node:crypto';

import {
	ReceiptWorkerAuthenticationError,
	ReceiptWorkerConfigurationError
} from './receipt-import-errors';

function hashSecret(value: string): Buffer {
	return createHash('sha256').update(value).digest();
}

export function assertReceiptWorkerApiKey(request: Request): void {
	const configuredApiKey = process.env.RECEIPT_WORKER_API_KEY?.trim();

	if (configuredApiKey === undefined || configuredApiKey.length < 32) {
		throw new ReceiptWorkerConfigurationError();
	}

	const [scheme, providedApiKey] = (request.headers.get('authorization') ?? '').split(' ', 2);

	if (
		scheme.toLowerCase() !== 'bearer'
		|| !timingSafeEqual(hashSecret(configuredApiKey), hashSecret(providedApiKey))
	) {
		throw new ReceiptWorkerAuthenticationError();
	}
}
