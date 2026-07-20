import type { Options } from '@node-rs/argon2';
import { hash, verify } from '@node-rs/argon2';

const PASSWORD_OPTIONS = {
    algorithm: 2,
    version: 1,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32
} as const satisfies Options;

/**
 * Produces a salted Argon2id password hash using the application policy.
 */
export async function hashPassword(password: string): Promise<string> {
    return hash(password, PASSWORD_OPTIONS);
}

/**
 * Verifies a password against a stored Argon2 encoded hash.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
}
