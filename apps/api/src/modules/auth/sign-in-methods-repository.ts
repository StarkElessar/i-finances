import type { AppDatabase } from '@/infrastructure/database/client';
import { telegramAccounts, users } from '@/infrastructure/database/schema';

import { eq } from 'drizzle-orm';

import { hasUsablePassword } from './has-usable-password';

/**
 * How a user can sign in besides passkeys: a usable password and a linked Telegram account. Read on every call, never
 * cached, because the answer decides whether the last passkey may be deleted.
 */
export type SignInMethods = {
	displayName: string;
	hasPassword: boolean;
	isActive: boolean;
	/** `null` while no Telegram account is linked; `username` without `@`, `null` when the person has none. */
	telegram: { username: string | null } | null;
	username: string;
};

export type SignInMethodsPort = {
	read: (userId: string) => Promise<SignInMethods | undefined>;
};

/**
 * Reads `users` and `telegram_accounts` (synchronously, one after the other), shared by the session answer (`hasPassword`, `telegram`), the
 * last-passkey rule of «Безопасность» and the passkey `userName` (A10). The password hash itself never leaves here.
 */
export class SignInMethodsRepository implements SignInMethodsPort {
	public constructor(private readonly database: AppDatabase) {}

	public async read(userId: string): Promise<SignInMethods | undefined> {
		const user = this.database.select({
			displayName: users.displayName,
			isActive: users.isActive,
			passwordHash: users.passwordHash,
			username: users.username
		})
			.from(users)
			.where(eq(users.id, userId))
			.get();

		if (user === undefined) {
			return undefined;
		}

		const telegram = this.database.select({ username: telegramAccounts.username })
			.from(telegramAccounts)
			.where(eq(telegramAccounts.userId, userId))
			.get();

		return {
			displayName: user.displayName,
			hasPassword: hasUsablePassword(user.passwordHash),
			isActive: user.isActive,
			telegram: telegram === undefined ? null : { username: telegram.username },
			username: user.username
		};
	}
}
