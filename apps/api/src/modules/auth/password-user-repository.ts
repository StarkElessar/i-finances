import { eq } from 'drizzle-orm';

import type { AppDatabase } from '../../infrastructure/database/client';
import { users } from '../../infrastructure/database/schema';

export type PasswordAuthUserRecord = {
	displayName: string;
	id: string;
	isActive: boolean;
	passwordHash: string;
	username: string;
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
}
