import { createHash } from 'node:crypto';

import type { SessionRepository } from './session-repository';

const SESSION_TOUCH_INTERVAL_MILLISECONDS = 24 * 60 * 60 * 1000;

export type SessionUser = {
	displayName: string;
	id: string;
	username: string;
};

export type AuthenticatedSession = {
	expiresAt: Date;
	id: string;
	user: SessionUser;
};

export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export class SessionService {
	public constructor(
		private readonly repository: SessionRepository,
		private readonly now: () => Date = () => new Date()
	) {}

	public async validateSessionToken(
		token: string | undefined
	): Promise<AuthenticatedSession | null> {
		if (token === undefined || token.length === 0) {
			return null;
		}

		const record = await this.repository.findByTokenHash(hashSessionToken(token));

		if (record === undefined) {
			return null;
		}

		const now = this.now();

		if (record.session.expiresAt <= now || !record.user.isActive) {
			await this.repository.delete(record.session.id);
			return null;
		}

		if (
			now.getTime() - record.session.lastSeenAt.getTime()
			>= SESSION_TOUCH_INTERVAL_MILLISECONDS
		) {
			await this.repository.touch(record.session.id, now);
		}

		return {
			expiresAt: record.session.expiresAt,
			id: record.session.id,
			user: record.user
		};
	}
}
