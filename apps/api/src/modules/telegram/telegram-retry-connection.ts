import { Agent, type Dispatcher } from 'undici';

/** The connection pool a request goes through. Node's `RequestInit` does not declare the `dispatcher` option, undici does. */
export type TelegramFetchDispatcher = Dispatcher;

/**
 * A connection pool used for one retry only. `close()` drops every socket of it, whatever state the attempt ended in.
 */
export type TelegramRetryConnection = {
	close: () => Promise<void>;
	dispatcher: TelegramFetchDispatcher;
};

/**
 * A retry must not go through the process-wide keep-alive pool: the attempt that just failed may have used a socket
 * that the other side (or a NAT in between) had silently closed. A private `Agent` has no sockets yet, so the retry
 * opens a fresh one; the global pool, and the requests of other callers, stay untouched.
 *
 * The npm `undici` Agent is handed to Node's built-in `fetch`: both are 7.x and share the `dispatch` contract (the
 * `package.json` range keeps the major version of the one bundled into Node 24).
 */
export function createTelegramRetryConnection(): TelegramRetryConnection {
	const agent = new Agent({ keepAliveMaxTimeout: 1000, keepAliveTimeout: 1000 });

	return {
		close: () => agent.destroy(),
		dispatcher: agent
	};
}
