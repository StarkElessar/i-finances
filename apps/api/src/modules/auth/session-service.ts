import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { type AuthConfig, getAuthConfig } from './auth-config';
import type { SessionRepository } from './session-repository';
import type { SessionInsertRecord } from './session-repository';

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

export type SessionMetadata = {
	ipAddress?: string;
	userAgent?: string;
};

export type CreatedSession = {
	expiresAt: Date;
	token: string;
};

export type SessionServiceOptions = {
	config?: AuthConfig;
	createId?: () => string;
	createToken?: () => string;
	now?: () => Date;
};

export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export class SessionService {
	private readonly config: AuthConfig;
	private readonly createId: () => string;
	private readonly createToken: () => string;
	private readonly now: () => Date;

	public constructor(
		private readonly repository: SessionRepository,
		options: SessionServiceOptions = {}
	) {
		this.config = options.config ?? getAuthConfig();
		this.createId = options.createId ?? randomUUID;
		this.createToken = options.createToken ?? (() => randomBytes(32).toString('base64url'));
		this.now = options.now ?? (() => new Date());
	}

	public async createSession(
		userId: string,
		metadata: SessionMetadata = {}
	): Promise<CreatedSession> {
		const now = this.now();
		const expiresAt = new Date(now.getTime() + this.config.sessionTtlMilliseconds);
		const token = this.createToken();
		const record: SessionInsertRecord = {
			createdAt: now,
			expiresAt,
			id: this.createId(),
			ipAddress: metadata.ipAddress,
			lastSeenAt: now,
			tokenHash: hashSessionToken(token),
			userAgent: metadata.userAgent,
			userId
		};

		await this.repository.insert(record);

		return { expiresAt, token };
	}

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

	public async revokeSessionToken(token: string | undefined): Promise<void> {
		if (token === undefined || token.length === 0) {
			return;
		}

		const record = await this.repository.findByTokenHash(hashSessionToken(token));

		if (record !== undefined) {
			await this.repository.delete(record.session.id);
		}
	}

	public deleteExpiredSessions(): Promise<void> {
		return this.repository.deleteExpired(this.now());
	}
}
