import {
	createHash,
	timingSafeEqual
} from 'node:crypto';

/**
 * Signals that a receipt worker did not provide the configured API key.
 */
export class ReceiptWorkerAuthenticationError extends Error {
	readonly statusCode = 401;

	constructor() {
		super('Receipt worker authentication failed.');
		this.name = 'ReceiptWorkerAuthenticationError';
	}
}

/**
 * Signals that worker API authentication is not configured on the server.
 */
export class ReceiptWorkerConfigurationError extends Error {
	readonly statusCode = 503;

	constructor() {
		super('Receipt worker API key is not configured.');
		this.name = 'ReceiptWorkerConfigurationError';
	}
}

function hashSecret(value: string): Buffer {
	return createHash('sha256').update(value).digest();
}

/**
 * Validates the Bearer key supplied by the broker or Mac Mini worker.
 */
export function assertReceiptWorkerApiKey(request: Request): void {
	const configuredApiKey = process.env.RECEIPT_WORKER_API_KEY?.trim();

	if (!configuredApiKey || configuredApiKey.length < 32) {
		throw new ReceiptWorkerConfigurationError();
	}

	const authorization = request.headers.get('authorization') ?? '';
	const [scheme, providedApiKey] = authorization.split(' ', 2);

	if (
		scheme.toLowerCase() !== 'bearer'
		|| !providedApiKey
		|| !timingSafeEqual(
			hashSecret(configuredApiKey),
			hashSecret(providedApiKey)
		)
	) {
		throw new ReceiptWorkerAuthenticationError();
	}
}
