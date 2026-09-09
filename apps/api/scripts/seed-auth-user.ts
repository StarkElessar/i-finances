import { randomUUID } from 'node:crypto';

import { db, sqlite } from '@/infrastructure/database/client';
import {
	householdMembers,
	households,
	users
} from '@/infrastructure/database/schema';
import { normalizeUsername, PasswordService } from '@/modules/auth';
import {
	DEFAULT_HOUSEHOLD_BASE_CURRENCY,
	DEFAULT_HOUSEHOLD_ID,
	DEFAULT_HOUSEHOLD_NAME
} from '@/modules/household';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

const seedEnvironmentSchema = z.object({
	SEED_DISPLAY_NAME: z.string().trim().min(1).max(100),
	SEED_HOUSEHOLD_ID: z.string().trim().min(1).max(128).default(DEFAULT_HOUSEHOLD_ID),
	SEED_HOUSEHOLD_NAME: z.string().trim().min(1).max(120).default(DEFAULT_HOUSEHOLD_NAME),
	SEED_PASSWORD: z.string().min(12).max(256),
	SEED_USERNAME: z.string().trim().min(3).max(64)
});

type SeedEnvironment = z.infer<typeof seedEnvironmentSchema>;

const passwordService = new PasswordService();

/**
 * Creates or updates one explicitly configured user and returns its stable ID.
 */
async function upsertAuthUser(environment: SeedEnvironment): Promise<string> {
	const username = normalizeUsername(environment.SEED_USERNAME);
	const passwordHash = await passwordService.hash(environment.SEED_PASSWORD);
	const existingUser = db.select()
		.from(users)
		.where(eq(users.username, username))
		.get();
	const now = new Date();

	if (existingUser) {
		await db.update(users)
			.set({
				displayName: environment.SEED_DISPLAY_NAME,
				isActive: true,
				passwordHash,
				updatedAt: now
			})
			.where(eq(users.id, existingUser.id));

		console.warn(`Updated auth user "${username}".`);
		return existingUser.id;
	}

	const userId = randomUUID();

	await db.insert(users).values({
		createdAt: now,
		displayName: environment.SEED_DISPLAY_NAME,
		id: userId,
		passwordHash,
		updatedAt: now,
		username
	});

	console.warn(`Created auth user "${username}".`);

	return userId;
}

/**
 * Ensures the seeded user belongs to the single initial household.
 */
async function ensureSeedHousehold(
	environment: SeedEnvironment,
	userId: string
): Promise<void> {
	const now = new Date();

	await db.insert(households)
		.values({
			baseCurrency: DEFAULT_HOUSEHOLD_BASE_CURRENCY,
			createdAt: now,
			id: environment.SEED_HOUSEHOLD_ID,
			name: environment.SEED_HOUSEHOLD_NAME,
			updatedAt: now
		})
		.onConflictDoUpdate({
			set: {
				name: environment.SEED_HOUSEHOLD_NAME,
				updatedAt: now
			},
			target: households.id
		});

	await db.insert(householdMembers)
		.values({
			householdId: environment.SEED_HOUSEHOLD_ID,
			joinedAt: now,
			role: 'owner',
			userId
		})
		.onConflictDoNothing();

	console.warn(`Ensured household "${environment.SEED_HOUSEHOLD_ID}" membership.`);
}

/**
 * Seeds one authenticated user and their initial household membership.
 */
async function seedAuthUser(): Promise<void> {
	const environment = seedEnvironmentSchema.parse(process.env);
	const userId = await upsertAuthUser(environment);

	await ensureSeedHousehold(environment, userId);
}

seedAuthUser()
	.catch((error: unknown) => {
		console.error('Failed to seed auth user.', error);
		process.exitCode = 1;
	})
	.finally(() => {
		sqlite.close();
	});
