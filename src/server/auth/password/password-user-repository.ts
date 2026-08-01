import { eq } from 'drizzle-orm';

import { db } from '~/server/db/client';
import { users } from '~/server/db/schema';

/**
 * User fields required to authenticate password credentials.
 */
export type PasswordAuthUserRecord = {
	id: string;
	username: string;
	passwordHash: string;
	isActive: boolean;
};

/**
 * Finds one user by the canonical username used for password login.
 */
export async function findPasswordAuthUserByUsername(username: string): Promise<PasswordAuthUserRecord | undefined> {
	return db.query.users.findFirst({
		columns: {
			id: true,
			username: true,
			passwordHash: true,
			isActive: true
		},
		where: eq(users.username, username)
	});
}
