import type { AppDatabase } from '@/infrastructure/database/client';
import { sessions, users } from '@/infrastructure/database/schema';

import { and, eq, ne } from 'drizzle-orm';

import { type SessionInsertRecord, SessionRepository } from './session-repository';

export type PasswordAuthUserRecord = {
	displayName: string;
	id: string;
	isActive: boolean;
	/** NULL when the user has no password (signed up through Telegram); check with `hasUsablePassword`. */
	passwordHash: string | null;
	username: string;
};

export type ReplacePasswordInput = {
	/** The hash the caller verified; the update is skipped if it changed meanwhile. */
	expectedPasswordHash: string;
	/** The session that stays signed in. Its token is replaced by the one whose hash is `rotatedTokenHash`. */
	keepSessionId: string;
	newPasswordHash: string;
	now: Date;
	/** Hash of the new secret of the kept session. The old secret stops working in the same transaction. */
	rotatedTokenHash: string;
	userId: string;
};

export type PasswordReplacement = {
	revokedSessionCount: number;
	/**
	 * Set when the kept session still existed and now carries the new token; its unchanged expiry is returned so the
	 * caller can issue a cookie that matches the row. Absent when that session vanished meanwhile (signed out in parallel).
	 */
	rotatedSession?: { expiresAt: Date };
};

export type PasswordSessionInput = {
	/** The hash the sign-in verified the password against. */
	expectedPasswordHash: string;
	session: SessionInsertRecord;
};

export class PasswordUserRepository {
	private readonly sessions: SessionRepository;

	public constructor(private readonly database: AppDatabase) {
		this.sessions = new SessionRepository(database);
	}

	public async findByUsername(
		username: string
	): Promise<PasswordAuthUserRecord | undefined> {
		const [user] = await this.database.select({
			displayName: users.displayName,
			id: users.id,
			isActive: users.isActive,
			passwordHash: users.passwordHash,
			username: users.username
		})
			.from(users)
			.where(eq(users.username, username))
			.limit(1);

		return user;
	}

	public async findById(
		id: string
	): Promise<PasswordAuthUserRecord | undefined> {
		const [user] = await this.database.select({
			displayName: users.displayName,
			id: users.id,
			isActive: users.isActive,
			passwordHash: users.passwordHash,
			username: users.username
		})
			.from(users)
			.where(eq(users.id, id))
			.limit(1);

		return user;
	}

	/**
	 * Stores the session of a password sign-in only while the user is still active and the stored hash is still the one
	 * the password was verified against. Argon2 takes tens of milliseconds, and a password change (which ends every other
	 * session, `replacePasswordAndRotateSessions`) may commit meanwhile: a session created after it from the replaced
	 * password would survive the change. Check and insert are one `immediate` transaction, so no change commits between
	 * them. Returns `false` and stores nothing when the check fails.
	 */
	public insertSessionIfPasswordUnchanged(input: PasswordSessionInput): boolean {
		return this.database.transaction((transaction) => {
			const user = transaction.select({ id: users.id })
				.from(users)
				.where(and(
					eq(users.id, input.session.userId),
					eq(users.passwordHash, input.expectedPasswordHash),
					eq(users.isActive, true)
				))
				.get();

			if (user === undefined) {
				return false;
			}

			this.sessions.insertWith(input.session, transaction);

			return true;
		}, { behavior: 'immediate' });
	}

	public async updateDisplayName(userId: string, displayName: string): Promise<void> {
		await this.database.update(users)
			.set({ displayName, updatedAt: new Date() })
			.where(eq(users.id, userId));
	}

	/**
	 * Stores the new password hash, deletes every other session of the user and replaces the token hash of the kept
	 * session, all in one transaction: a changed password never leaves old sessions alive, and a stolen cookie of the
	 * kept session stops working. The session keeps its id, creation time, expiry and metadata: the expiry is never
	 * extended, so re-keying cannot keep a session alive past its original lifetime (`development/decisions/session-rotation.md`).
	 * Returns `undefined` when the stored hash no longer matches `expectedPasswordHash` (the password changed concurrently).
	 */
	public replacePasswordAndRotateSessions(input: ReplacePasswordInput): PasswordReplacement | undefined {
		return this.database.transaction((transaction) => {
			const updated = transaction.update(users)
				.set({ passwordHash: input.newPasswordHash, updatedAt: input.now })
				.where(and(eq(users.id, input.userId), eq(users.passwordHash, input.expectedPasswordHash)))
				.returning({ id: users.id })
				.all();

			if (updated.length === 0) {
				return undefined;
			}

			const revokedSessionCount = transaction.delete(sessions)
				.where(and(eq(sessions.userId, input.userId), ne(sessions.id, input.keepSessionId)))
				.returning({ id: sessions.id })
				.all()
				.length;
			const rotatedRows = transaction.update(sessions)
				.set({ tokenHash: input.rotatedTokenHash })
				.where(and(eq(sessions.id, input.keepSessionId), eq(sessions.userId, input.userId)))
				.returning({ expiresAt: sessions.expiresAt })
				.all();

			return {
				revokedSessionCount,
				rotatedSession: rotatedRows.length === 0 ? undefined : { expiresAt: rotatedRows[0].expiresAt }
			};
		});
	}
}
