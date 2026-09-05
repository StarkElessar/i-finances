import { createApiApp } from '@/app';
import { ContactHttpController } from '@/http/contact-controller';
import type { RequestSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { householdMembers, households, users } from '@/infrastructure/database/schema';
import type { AuthenticatedSession } from '@/modules/auth';
import {
	ContactNameConflictError,
	ContactRepository,
	ContactService,
	ContactVersionConflictError
} from '@/modules/contact';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';

import {
	createContactInputSchema,
	updateContactInputSchema
} from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const FIXED_DATE = new Date('2026-08-08T10:00:00.000Z');

const authenticatedSession: AuthenticatedSession = {
	expiresAt: new Date('2026-09-08T10:00:00.000Z'),
	id: 'session-1',
	user: {
		displayName: 'Sergei Test',
		id: USER_ID,
		username: 'sergei'
	}
};

let connection: Database.Database;
let database: AppDatabase;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });

	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: 'Sergei Test',
		id: USER_ID,
		isActive: true,
		passwordHash: 'hash',
		updatedAt: FIXED_DATE,
		username: 'sergei'
	});
	await database.insert(households).values({
		baseCurrency: 'BYN',
		createdAt: FIXED_DATE,
		id: HOUSEHOLD_ID,
		name: 'Семья',
		updatedAt: FIXED_DATE
	});
	await database.insert(householdMembers).values({
		householdId: HOUSEHOLD_ID,
		joinedAt: FIXED_DATE,
		role: 'owner',
		userId: USER_ID
	});
});

afterEach(() => {
	connection.close();
});

function createService(): ContactService {
	return new ContactService({
		contactRepository: new ContactRepository(database),
		createId: () => 'contact-main',
		householdResolver: new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE),
		now: () => FIXED_DATE
	});
}

function contactInput() {
	return createContactInputSchema.parse({
		color: '#3f77a8',
		legalName: '  ООО «Продукты»  ',
		name: '  Магазин   у дома ',
		type: 'company'
	});
}

describe('ContactService', () => {
	it('normalizes contacts, enforces names, and keeps archive state household-scoped', async () => {
		const service = createService();
		const created = await service.create(USER_ID, contactInput());

		expect(created).toMatchObject({
			archivedAt: null,
			legalName: 'ООО «Продукты»',
			name: 'Магазин у дома',
			type: 'company',
			version: 1
		});
		await expect(service.create(USER_ID, contactInput())).rejects.toBeInstanceOf(ContactNameConflictError);

		const archived = await service.archive(USER_ID, { id: created.id, version: created.version });
		const active = await service.list(USER_ID, 'active');
		const archivedContacts = await service.list(USER_ID, 'archived');

		expect(active.items).toEqual([]);
		expect(archivedContacts.items).toEqual([archived]);
	});

	it('updates with optimistic locking and restores idempotently', async () => {
		const service = createService();
		const created = await service.create(USER_ID, contactInput());
		const updated = await service.update(USER_ID, updateContactInputSchema.parse({
			...contactInput(),
			id: created.id,
			legalName: null,
			name: 'Покупатель',
			type: 'person',
			version: created.version
		}));

		expect(updated).toMatchObject({ legalName: null, name: 'Покупатель', type: 'person', version: 2 });
		await expect(service.update(USER_ID, updateContactInputSchema.parse({
			...updated,
			version: created.version
		}))).rejects.toBeInstanceOf(ContactVersionConflictError);

		const archived = await service.archive(USER_ID, { id: updated.id, version: updated.version });
		const archivedAgain = await service.archive(USER_ID, { id: archived.id, version: archived.version });
		const restored = await service.restore(USER_ID, { id: archived.id, version: archived.version });

		expect(archivedAgain).toEqual(archived);
		expect(restored).toMatchObject({ archivedAt: null, version: 4 });
	});

	it('serves contact reads through the authenticated HTTP boundary', async () => {
		await createService().create(USER_ID, contactInput());
		const noSessionResolver: RequestSessionResolver = { resolve: async () => null };
		const sessionResolver: RequestSessionResolver = { resolve: async () => authenticatedSession };
		const unauthenticatedApp = createApiApp({
			contactController: new ContactHttpController(createService(), noSessionResolver)
		});
		const authenticatedApp = createApiApp({
			contactController: new ContactHttpController(createService(), sessionResolver)
		});

		expect((await unauthenticatedApp.request('/api/contacts')).status).toBe(401);
		const response = await authenticatedApp.request('/api/contacts?status=active');

		expect(response.status).toBe(200);
		expect((await response.json())).toMatchObject({
			baseCurrency: 'BYN',
			items: [{ id: 'contact-main', name: 'Магазин у дома' }]
		});
	});
});
