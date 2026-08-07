import { eq } from 'drizzle-orm';

import type { AppDatabase } from '../../infrastructure/database/client';
import {
	users,
	type WebauthnCredentialRecord,
	webauthnCredentials
} from '../../infrastructure/database/schema';

export type WebAuthnCredential = {
	backedUp: boolean;
	counter: number;
	createdAt: Date;
	deviceName: string | null;
	deviceType: string;
	id: string;
	lastUsedAt: Date | null;
	publicKey: string;
	transports: string[] | null;
	userId: string;
};

export type WebAuthnCredentialInsert = Omit<
	WebAuthnCredential,
	'deviceName' | 'lastUsedAt' | 'transports'
> & {
	deviceName?: string | null;
	lastUsedAt?: Date;
	transports?: string[] | null;
};

export type WebAuthnCredentialWithUser = {
	credential: WebAuthnCredential;
	user: {
		displayName: string;
		id: string;
		isActive: boolean;
		username: string;
	};
};

export type WebAuthnCredentialUsage = {
	backedUp: boolean;
	counter: number;
	deviceType: string;
	id: string;
	lastUsedAt: Date;
};

function mapCredential(record: WebauthnCredentialRecord): WebAuthnCredential {
	return {
		backedUp: record.backedUp,
		counter: record.counter,
		createdAt: record.createdAt,
		deviceName: record.deviceName,
		deviceType: record.deviceType,
		id: record.id,
		lastUsedAt: record.lastUsedAt,
		publicKey: record.publicKey,
		transports: record.transports,
		userId: record.userId
	};
}

/**
 * Translates persisted passkey credentials into application records.
 */
export class WebAuthnCredentialRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async findByUserId(userId: string): Promise<WebAuthnCredential[]> {
		const records = await this.database.select()
			.from(webauthnCredentials)
			.where(eq(webauthnCredentials.userId, userId));

		return records.map(mapCredential);
	}

	public async findByCredentialId(
		id: string
	): Promise<WebAuthnCredentialWithUser | undefined> {
		const records = await this.database.select({
			credential: webauthnCredentials,
			user: {
				displayName: users.displayName,
				id: users.id,
				isActive: users.isActive,
				username: users.username
			}
		})
			.from(webauthnCredentials)
			.innerJoin(users, eq(webauthnCredentials.userId, users.id))
			.where(eq(webauthnCredentials.id, id))
			.limit(1);

		if (records.length === 0) {
			return undefined;
		}

		const [record] = records;

		return {
			credential: mapCredential(record.credential),
			user: record.user
		};
	}

	public async insert(record: WebAuthnCredentialInsert): Promise<void> {
		await this.database.insert(webauthnCredentials).values(record);
	}

	public async updateUsage(input: WebAuthnCredentialUsage): Promise<void> {
		await this.database.update(webauthnCredentials)
			.set({
				backedUp: input.backedUp,
				counter: input.counter,
				deviceType: input.deviceType,
				lastUsedAt: input.lastUsedAt
			})
			.where(eq(webauthnCredentials.id, input.id));
	}
}
