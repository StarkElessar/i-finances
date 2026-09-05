import type { AppDatabase } from '@/infrastructure/database/client';
import {
	type WebauthnChallengePurpose,
	type WebauthnChallengeRecord,
	webauthnChallenges
} from '@/infrastructure/database/schema';

import { and, eq, gt, isNull } from 'drizzle-orm';

export type WebAuthnChallengeInsertRecord = {
	challenge: string;
	createdAt: Date;
	expiresAt: Date;
	id: string;
	purpose: WebauthnChallengePurpose;
	userId?: string;
};

export type ConsumeWebAuthnChallengeInput = {
	challenge: string;
	now: Date;
	purpose: WebauthnChallengePurpose;
	userId?: string;
};

/**
 * Owns the one-time challenge lifecycle and its atomic consumption rule.
 */
export class WebAuthnChallengeRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async insert(record: WebAuthnChallengeInsertRecord): Promise<void> {
		await this.database.insert(webauthnChallenges).values(record);
	}

	public async consume(
		input: ConsumeWebAuthnChallengeInput
	): Promise<WebauthnChallengeRecord | undefined> {
		const conditions = [
			eq(webauthnChallenges.challenge, input.challenge),
			eq(webauthnChallenges.purpose, input.purpose),
			isNull(webauthnChallenges.consumedAt),
			gt(webauthnChallenges.expiresAt, input.now)
		];

		if (input.userId !== undefined) {
			conditions.push(eq(webauthnChallenges.userId, input.userId));
		}

		const [record] = await this.database.update(webauthnChallenges)
			.set({ consumedAt: input.now })
			.where(and(...conditions))
			.returning();

		return record;
	}
}
