import type { AppDatabase } from '@/infrastructure/database/client';
import { sessions, users } from '@/infrastructure/database/schema';

import { and, eq, ne } from 'drizzle-orm';

export type PasswordAuthUserRecord = {
	displayName: string;
	id: string;
	isActive: boolean;
	passwordHash: string;
	username: string;
};

export type ReplacePasswordInput = {
	/** The hash the caller verified; the update is skipped if it changed meanwhile. */
	expectedPasswordHash: string;
	/** The session that stays signed in. */
	keepSessionId: string;
	newPasswordHash: string;
	now: Date;
	userId: string;
};

export class PasswordUserRepository {
	public constructor(private readonly database: AppDatabase) {}

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

	public async updateDisplayName(userId: string, displayName: string): Promise<void> {
		await this.database.update(users)
			.set({ displayName, updatedAt: new Date() })
			.where(eq(users.id, userId));
	}

	/**
	 * Stores the new password hash and deletes every other session of the user
	 * in one transaction, so a changed password never leaves old sessions alive.
	 * Returns the number of revoked sessions, or `undefined` when the stored hash
	 * no longer matches `expectedPasswordHash` (the password changed concurrently).
	 */
	public replacePasswordAndRevokeOtherSessions(input: ReplacePasswordInput): number | undefined {
		return this.database.transaction((transaction) => {
			const updated = transaction.update(users)
				.set({ passwordHash: input.newPasswordHash, updatedAt: input.now })
				.where(and(eq(users.id, input.userId), eq(users.passwordHash, input.expectedPasswordHash)))
				.returning({ id: users.id })
				.all();

			if (updated.length === 0) {
				return undefined;
			}

			return transaction.delete(sessions)
				.where(and(eq(sessions.userId, input.userId), ne(sessions.id, input.keepSessionId)))
				.returning({ id: sessions.id })
				.all()
				.length;
		});
	}
}
