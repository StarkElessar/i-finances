/** No prefetch: every pull records a portion actually requested by the middleware. */
export function createRequestBodyStream(value: string, options: { endless?: boolean } = {}) {
	const bytes = new TextEncoder().encode(value);
	let position = 0;
	let readChunks = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			readChunks += 1;
			controller.enqueue(bytes.subarray(position, position + 1024));
			position += 1024;

			if (position >= bytes.length) {
				if (options.endless) {
					position = 0;
				}
				else {
					controller.close();
				}
			}
		}
	}, { highWaterMark: 0 });

	return { body, readChunks: () => readChunks };
}
