import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { normalizeUsername } from '../src/server/auth/password/normalize-username';
import { hashPassword } from '../src/server/auth/password/password-service';
import { db } from '../src/server/db/client';
import {
    householdMembers,
    households,
    users
} from '../src/server/db/schema';
import {
    DEFAULT_HOUSEHOLD_BASE_CURRENCY,
    DEFAULT_HOUSEHOLD_ID,
    DEFAULT_HOUSEHOLD_NAME
} from '../src/server/household/default-household';

const seedEnvironmentSchema = z.object({
    SEED_DISPLAY_NAME: z.string().trim().min(1).max(100),
    SEED_HOUSEHOLD_ID: z.string().trim().min(1).max(128).default(DEFAULT_HOUSEHOLD_ID),
    SEED_HOUSEHOLD_NAME: z.string().trim().min(1).max(120).default(DEFAULT_HOUSEHOLD_NAME),
    SEED_PASSWORD: z.string().min(12).max(256),
    SEED_USERNAME: z.string().trim().min(3).max(64)
});

type SeedEnvironment = z.infer<typeof seedEnvironmentSchema>;

/**
 * Creates or updates one explicitly configured user and returns its stable ID.
 */
async function upsertAuthUser(environment: SeedEnvironment): Promise<string> {
    const username = normalizeUsername(environment.SEED_USERNAME);
    const passwordHash = await hashPassword(environment.SEED_PASSWORD);
    const existingUser = await db.query.users.findFirst({
        where: eq(users.username, username)
    });
    const now = new Date();

    if (existingUser) {
        await db.update(users)
            .set({
                displayName: environment.SEED_DISPLAY_NAME,
                passwordHash,
                isActive: true,
                updatedAt: now
            })
            .where(eq(users.id, existingUser.id));

        console.warn(`Updated auth user "${username}".`);
        return existingUser.id;
    }

    const userId = randomUUID();

    await db.insert(users).values({
        id: userId,
        username,
        displayName: environment.SEED_DISPLAY_NAME,
        passwordHash,
        createdAt: now,
        updatedAt: now
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
            target: households.id,
            set: {
                name: environment.SEED_HOUSEHOLD_NAME,
                updatedAt: now
            }
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

seedAuthUser().catch((error: unknown) => {
    console.error('Failed to seed auth user.', error);
    process.exitCode = 1;
});
