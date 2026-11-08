import { ApiHttpError } from '@/shared/api';

const FALLBACK_REASON = 'не удалось отправить';

function readServerMessage(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null || !('message' in body)) {
		return undefined;
	}

	return typeof body.message === 'string' && body.message !== '' ? body.message : undefined;
}

/** Turns a failed upload into a short reason for a toast. Never throws. */
export function describeUploadFailure(error: unknown): string {
	if (error instanceof ApiHttpError) {
		if (error.status === 413) {
			return 'файл слишком большой';
		}

		return readServerMessage(error.body)?.replace(/\.$/, '') ?? FALLBACK_REASON;
	}

	// `fetch` rejects with a TypeError when the phone has no connection.
	if (error instanceof TypeError) {
		return 'нет соединения';
	}

	return FALLBACK_REASON;
}
