import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { normalizeUsername } from '../src/server/auth/password/normalize-username';
import { hashPassword } from '../src/server/auth/password/password-service';
import { db } from '../src/server/db/client';
import { users } from '../src/server/db/schema';

const seedEnvironmentSchema = z.object({
    SEED_USERNAME: z.string().trim().min(3).max(64),
    SEED_PASSWORD: z.string().min(12).max(256),
    SEED_DISPLAY_NAME: z.string().trim().min(1).max(100)
});

/**
 * Creates or updates one explicitly configured family user.
 */
async function seedAuthUser(): Promise<void> {
    const environment = seedEnvironmentSchema.parse(process.env);
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
        return;
    }

    await db.insert(users).values({
        id: randomUUID(),
        username,
        displayName: environment.SEED_DISPLAY_NAME,
        passwordHash,
        createdAt: now,
        updatedAt: now
    });

    console.warn(`Created auth user "${username}".`);
}

seedAuthUser().catch((error: unknown) => {
    console.error('Failed to seed auth user.', error);
    process.exitCode = 1;
});
