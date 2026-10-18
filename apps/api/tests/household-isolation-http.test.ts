import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { createApiApp as CreateApiApp } from '@/app';
import type {
	createApiDependencies as CreateApiDependencies,
	toApiAppDependencies as ToApiAppDependencies
} from '@/composition-root';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	householdMembers,
	households,
	sessions,
	telegramAccounts,
	users,
	webauthnCredentials
} from '@/infrastructure/database/schema';
import { hashSessionToken } from '@/modules/auth';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeTelegramBotClient } from './support/fake-telegram-bot-client';

/**
 * A8: one HTTP test of household isolation over every route of the real production graph (`createApiDependencies`).
 *
 * Household A is the pre-existing `default-household` with an owner and a member (the state DB-3 leaves), household
 * B has its own owner, and a third user has no household at all. Every registered route has at least one probe in
 * `PROBES`; a route without a probe fails «every route has a probe». Each probe runs as user B and as the user
 * without a household, on a fresh `:memory:` database, and checks that:
 *
 * - the status is the expected one (404/403/409 on A's ids, 200 with B's own data on lists);
 * - the user without a household gets 403 `household-required` on every household-scoped route;
 * - the response contains no id and no name of household A (names carry the marker «Альфа») and not the amount of
 *   its operation (`A_AMOUNT_MINOR`, the only trace an aggregate leak leaves);
 * - no row of household A was changed, added or removed, and no other row now contains A's ids or names;
 * - a probe that sends ids of A gets exactly the answer (status and body) it gets for ids that exist nowhere, so
 *   no route tells «someone else's» from «does not exist».
 */

const ORIGIN = 'http://localhost:5173';
const MCP_API_KEY = 'm'.repeat(48);
const TELEGRAM_WEBHOOK_SECRET = 'isolation-webhook-secret-0123456789';
const A_HOUSEHOLD = 'default-household';
const B_HOUSEHOLD = 'beta-household';
const A_OWNER = 'alpha-owner';
const A_MEMBER = 'alpha-member';
const B_OWNER = 'beta-owner';
const LONER = 'loner';
const A_MARKER = /альфа/iu;
/**
 * The amount of the one operation of household A. Aggregates (monthly trend, summaries) carry no ids or names, so a
 * leak of A's totals shows only as this number; household B has no operations of its own in the fixture.
 */
const A_AMOUNT_MINOR = 7_310_947;
const A_AMOUNT_MARKER = new RegExp(`(?<!\\d)${A_AMOUNT_MINOR}(?!\\d)`, 'u');
/** A well-formed sign-in code that no request has. */
const UNKNOWN_LOGIN_CODE = 'unknownloginrequestcode000000000';
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

type Actor = 'beta' | 'loner';
type Scope = 'household' | 'onboarding' | 'user' | 'public';

type Entity = { id: string; version: number };

type Fixture = {
	alpha: {
		account: Entity;
		account2: Entity;
		category: Entity;
		contact: Entity;
		operation: Entity;
		ownerPasskeyId: string;
		ownerSessionId: string;
		receipt: Entity;
		transfer: Entity;
	};
	beta: {
		account: Entity;
		account2: Entity;
		category: Entity;
		contact: Entity;
	};
};

type ProbeRequest = {
	body?: unknown;
	form?: () => Promise<FormData>;
	/** Extra headers, e.g. the Telegram webhook secret. */
	headers?: Record<string, string>;
	path: string;
	/** The TCP peer the node server reports; none (as with `app.request`) by default. */
	peerAddress?: string;
};

type Probe = {
	/** Allowed statuses for user B (member of the other household). */
	beta: number[];
	/** Allowed statuses for the user without a household; household-scoped routes always expect 403 household-required. */
	loner?: number[];
	name: string;
	request: (fixture: Fixture) => ProbeRequest;
	/** `METHOD /path` exactly as registered in `createApiApp`. */
	route: string;
	scope: Scope;
};

const accountBody = (name: string) => ({
	color: '#3f77a8',
	currency: 'BYN',
	description: '',
	initialBalanceMinor: 10_000,
	isColorAccentEnabled: false,
	isIncludedInFamilyTotal: true,
	name,
	owner: '',
	type: 'cash'
});

const categoryBody = (name: string, keyword: string) => ({
	color: '#3f77a8',
	description: '',
	icon: 'tag',
	keywords: [keyword],
	monthlyBudgetMinor: null,
	name
});

const contactBody = (name: string) => ({
	color: '#3f77a8',
	legalName: null,
	name,
	phone: null,
	type: 'company'
});

type OperationBodyInput = { accountId: string; amountMinor?: number; categoryId: string | null; contactId: string | null; title: string };

const operationBody = (input: OperationBodyInput) => ({
	accountId: input.accountId,
	amountMinor: input.amountMinor ?? 1_000,
	categoryId: input.categoryId,
	comment: '',
	contactId: input.contactId,
	happenedOn: '2026-10-01',
	title: input.title,
	type: 'expense'
});

const transferBody = (fromAccountId: string, toAccountId: string) => ({
	comment: '',
	contactId: null,
	exchangeRate: '1',
	fromAccountId,
	fromAmountMinor: 500,
	happenedOn: '2026-10-01',
	toAccountId
});

const reviewBody = {
	categorizedItems: [{ categoryId: null, confidence: null, itemIndex: 0 }],
	happenedOn: '2026-10-01',
	items: [{ discountMinor: 0, name: 'Хлеб', quantity: 1, totalMinor: 100, unitPriceMinor: 100 }],
	merchant: { address: null, displayName: null, legalName: null, unp: null },
	totalAmountMinor: 100
};

let receiptPng: Uint8Array;

async function receiptForm(): Promise<FormData> {
	const form = new FormData();

	form.set('image', new File([receiptPng as BlobPart], 'receipt.png', { type: 'image/png' }));

	return form;
}

const PROBES: Probe[] = [
	// Accounts
	{
		beta: [200],
		name: 'lists only own accounts',
		request: () => ({ path: '/api/accounts?includeArchived=true' }),
		route: 'GET /api/accounts',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot read A account',
		request: (f) => ({ path: `/api/accounts/${f.alpha.account.id}` }),
		route: 'GET /api/accounts/:id',
		scope: 'household'
	},
	{
		beta: [200],
		name: 'creates in own household',
		request: () => ({ body: accountBody('Бета новый'), path: '/api/accounts' }),
		route: 'POST /api/accounts',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot update A account',
		request: (f) => ({
			body: { ...accountBody('Захват'), version: f.alpha.account.version },
			path: `/api/accounts/${f.alpha.account.id}`
		}),
		route: 'PUT /api/accounts/:id',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot archive A account',
		request: (f) => ({ body: { version: f.alpha.account.version }, path: `/api/accounts/${f.alpha.account.id}/archive` }),
		route: 'POST /api/accounts/:id/archive',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot restore A account',
		request: (f) => ({ body: { version: f.alpha.account.version }, path: `/api/accounts/${f.alpha.account.id}/restore` }),
		route: 'POST /api/accounts/:id/restore',
		scope: 'household'
	},

	// Categories
	{
		beta: [200],
		name: 'lists only own categories',
		request: () => ({ path: '/api/categories?status=all' }),
		route: 'GET /api/categories',
		scope: 'household'
	},
	{
		beta: [200],
		name: 'creates in own household',
		request: () => ({ body: categoryBody('Бета новая', 'бета'), path: '/api/categories' }),
		route: 'POST /api/categories',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot update A category',
		request: (f) => ({
			body: { ...categoryBody('Захват', 'захват'), version: f.alpha.category.version },
			path: `/api/categories/${f.alpha.category.id}`
		}),
		route: 'PUT /api/categories/:id',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot archive A category',
		request: (f) => ({ body: { version: f.alpha.category.version }, path: `/api/categories/${f.alpha.category.id}/archive` }),
		route: 'POST /api/categories/:id/archive',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot restore A category',
		request: (f) => ({ body: { version: f.alpha.category.version }, path: `/api/categories/${f.alpha.category.id}/restore` }),
		route: 'POST /api/categories/:id/restore',
		scope: 'household'
	},

	// Contacts
	{
		beta: [200],
		name: 'lists only own contacts',
		request: () => ({ path: '/api/contacts?status=all' }),
		route: 'GET /api/contacts',
		scope: 'household'
	},
	{
		beta: [200],
		name: 'creates in own household',
		request: () => ({ body: contactBody('Бета новый'), path: '/api/contacts' }),
		route: 'POST /api/contacts',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot update A contact',
		request: (f) => ({
			body: { ...contactBody('Захват'), version: f.alpha.contact.version },
			path: `/api/contacts/${f.alpha.contact.id}`
		}),
		route: 'PUT /api/contacts/:id',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot archive A contact',
		request: (f) => ({ body: { version: f.alpha.contact.version }, path: `/api/contacts/${f.alpha.contact.id}/archive` }),
		route: 'POST /api/contacts/:id/archive',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot restore A contact',
		request: (f) => ({ body: { version: f.alpha.contact.version }, path: `/api/contacts/${f.alpha.contact.id}/restore` }),
		route: 'POST /api/contacts/:id/restore',
		scope: 'household'
	},

	// Exchange rates: global data, but the base currency comes from the household.
	{
		beta: [200],
		name: 'reads rates for own base currency',
		request: () => ({ path: '/api/exchange-rates/current' }),
		route: 'GET /api/exchange-rates/current',
		scope: 'household'
	},

	// Household
	{
		beta: [200],
		name: 'reads only own household',
		request: () => ({ path: '/api/household' }),
		route: 'GET /api/household',
		scope: 'household'
	},
	{
		beta: [409],
		loner: [201],
		name: 'cannot create a second household',
		request: () => ({ body: { name: 'Вторая' }, path: '/api/household' }),
		route: 'POST /api/household',
		scope: 'onboarding'
	},
	{
		beta: [200],
		name: 'renames only own household',
		request: () => ({ body: { name: 'Бета переименована' }, path: '/api/household' }),
		route: 'PUT /api/household',
		scope: 'household'
	},

	// Operations
	{
		beta: [200],
		name: 'balances of own accounts only',
		request: () => ({ path: '/api/operations/balances' }),
		route: 'GET /api/operations/balances',
		scope: 'household'
	},
	{
		beta: [409],
		name: 'cannot read the ledger of A account',
		request: (f) => ({ path: `/api/operations/ledger?accountId=${f.alpha.account.id}&start=2026-10-01&end=2026-10-31` }),
		route: 'GET /api/operations/ledger',
		scope: 'household'
	},
	{
		beta: [409],
		name: 'cannot read operations of A category',
		request: (f) => ({ path: `/api/operations/by-category?categoryId=${f.alpha.category.id}&start=2026-10-01&end=2026-10-31` }),
		route: 'GET /api/operations/by-category',
		scope: 'household'
	},
	{
		beta: [409],
		name: 'cannot read operations of A contact',
		request: (f) => ({ path: `/api/operations/by-contact?contactId=${f.alpha.contact.id}&start=2026-10-01&end=2026-10-31` }),
		route: 'GET /api/operations/by-contact',
		scope: 'household'
	},
	{
		beta: [200],
		name: 'own monthly summary',
		request: () => ({ path: '/api/operations/monthly-summary?month=2026-10' }),
		route: 'GET /api/operations/monthly-summary',
		scope: 'household'
	},
	{
		beta: [200],
		name: 'own category stats',
		request: () => ({ path: '/api/operations/category-stats?month=2026-10' }),
		route: 'GET /api/operations/category-stats',
		scope: 'household'
	},
	{
		beta: [200],
		name: 'own monthly trend',
		request: () => ({ path: '/api/operations/monthly-trend' }),
		route: 'GET /api/operations/monthly-trend',
		scope: 'household'
	},
	{
		beta: [200],
		name: 'own monthly breakdown',
		request: () => ({ path: '/api/operations/monthly-breakdown?by=category&from=2026-01&to=2026-10' }),
		route: 'GET /api/operations/monthly-breakdown',
		scope: 'household'
	},
	{
		beta: [409],
		name: 'cannot record on A account',
		request: (f) => ({
			body: operationBody({ accountId: f.alpha.account.id, categoryId: null, contactId: null, title: 'Чужой счёт' }),
			path: '/api/operations'
		}),
		route: 'POST /api/operations',
		scope: 'household'
	},
	{
		beta: [409],
		name: 'cannot use A category on own account',
		request: (f) => ({
			body: operationBody({
				accountId: f.beta.account.id,
				categoryId: f.alpha.category.id,
				contactId: null,
				title: 'Чужая категория'
			}),
			path: '/api/operations'
		}),
		route: 'POST /api/operations',
		scope: 'household'
	},
	{
		beta: [409],
		name: 'cannot use A contact on own account',
		request: (f) => ({
			body: operationBody({ accountId: f.beta.account.id, categoryId: null, contactId: f.alpha.contact.id, title: 'Чужой контакт' }),
			path: '/api/operations'
		}),
		route: 'POST /api/operations',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot update A operation',
		request: (f) => ({
			body: {
				...operationBody({ accountId: f.beta.account.id, categoryId: f.beta.category.id, contactId: null, title: 'Захват' }),
				version: f.alpha.operation.version
			},
			path: `/api/operations/${f.alpha.operation.id}`
		}),
		route: 'PUT /api/operations/:id',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot delete A operation',
		request: (f) => ({ body: { version: f.alpha.operation.version }, path: `/api/operations/${f.alpha.operation.id}/archive` }),
		route: 'POST /api/operations/:id/archive',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot restore A operation',
		request: (f) => ({ body: { version: f.alpha.operation.version }, path: `/api/operations/${f.alpha.operation.id}/restore` }),
		route: 'POST /api/operations/:id/restore',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot recalculate A operation',
		request: (f) => ({
			body: { version: f.alpha.operation.version },
			path: `/api/operations/${f.alpha.operation.id}/recalculate-rate`
		}),
		route: 'POST /api/operations/:id/recalculate-rate',
		scope: 'household'
	},

	// Receipts
	{
		beta: [200],
		name: 'lists only own receipts',
		request: () => ({ path: '/api/receipt-imports' }),
		route: 'GET /api/receipt-imports',
		scope: 'household'
	},
	{
		beta: [201],
		name: 'own receipt snapshots only own categories and contacts',
		request: () => ({ form: receiptForm, path: '/api/receipt-imports' }),
		route: 'POST /api/receipt-imports',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot read A receipt image',
		request: (f) => ({ path: `/api/receipt-imports/${f.alpha.receipt.id}/image` }),
		route: 'GET /api/receipt-imports/:id/image',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot request a revision of A receipt',
		request: (f) => ({
			body: { comment: 'Исправьте', version: f.alpha.receipt.version },
			path: `/api/receipt-imports/${f.alpha.receipt.id}/revision`
		}),
		route: 'POST /api/receipt-imports/:id/revision',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot retry A receipt',
		request: (f) => ({ body: { version: f.alpha.receipt.version }, path: `/api/receipt-imports/${f.alpha.receipt.id}/retry` }),
		route: 'POST /api/receipt-imports/:id/retry',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot edit A receipt review',
		request: (f) => ({
			body: { review: reviewBody, version: f.alpha.receipt.version },
			path: `/api/receipt-imports/${f.alpha.receipt.id}/review`
		}),
		route: 'PUT /api/receipt-imports/:id/review',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot approve A receipt into own account',
		request: (f) => ({
			body: {
				accountId: f.beta.account.id,
				contactId: null,
				operations: [{ amountMinor: 100, categoryId: null, itemIndexes: [0], title: 'Хлеб' }],
				version: f.alpha.receipt.version
			},
			path: `/api/receipt-imports/${f.alpha.receipt.id}/approve`
		}),
		route: 'POST /api/receipt-imports/:id/approve',
		scope: 'household'
	},

	// Transfers
	{
		beta: [404],
		name: 'cannot read A transfer',
		request: (f) => ({ path: `/api/transfers/${f.alpha.transfer.id}` }),
		route: 'GET /api/transfers/:id',
		scope: 'household'
	},
	{
		beta: [400],
		name: 'cannot transfer between A accounts',
		request: (f) => ({ body: transferBody(f.alpha.account.id, f.alpha.account2.id), path: '/api/transfers' }),
		route: 'POST /api/transfers',
		scope: 'household'
	},
	{
		beta: [400],
		name: 'cannot transfer from own into A account',
		request: (f) => ({ body: transferBody(f.beta.account.id, f.alpha.account.id), path: '/api/transfers' }),
		route: 'POST /api/transfers',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot update A transfer',
		request: (f) => ({
			body: { ...transferBody(f.beta.account.id, f.beta.account2.id), version: f.alpha.transfer.version },
			path: `/api/transfers/${f.alpha.transfer.id}`
		}),
		route: 'PUT /api/transfers/:id',
		scope: 'household'
	},
	{
		beta: [404],
		name: 'cannot delete A transfer',
		request: (f) => ({ body: { version: f.alpha.transfer.version }, path: `/api/transfers/${f.alpha.transfer.id}/delete` }),
		route: 'POST /api/transfers/:id/delete',
		scope: 'household'
	},

	// Security: user-scoped, works in onboarding too.
	{
		beta: [200],
		loner: [200],
		name: 'lists only own passkeys',
		request: () => ({ path: '/api/security/passkeys' }),
		route: 'GET /api/security/passkeys',
		scope: 'user'
	},
	{
		beta: [404],
		loner: [404],
		name: 'cannot delete A passkey',
		request: (f) => ({ path: `/api/security/passkeys/${f.alpha.ownerPasskeyId}` }),
		route: 'DELETE /api/security/passkeys/:id',
		scope: 'user'
	},
	{
		beta: [409],
		loner: [409],
		name: 'changes only own password',
		request: () => ({
			body: { currentPassword: 'whatever-password', newPassword: 'a-new-long-password' },
			path: '/api/security/password'
		}),
		route: 'POST /api/security/password',
		scope: 'user'
	},
	{
		beta: [200],
		loner: [200],
		name: 'lists only own sessions',
		request: () => ({ path: '/api/security/sessions' }),
		route: 'GET /api/security/sessions',
		scope: 'user'
	},
	{
		beta: [200],
		loner: [200],
		name: 'ends only own other sessions',
		request: () => ({ path: '/api/security/sessions/others' }),
		route: 'DELETE /api/security/sessions/others',
		scope: 'user'
	},
	{
		beta: [404],
		loner: [404],
		name: 'cannot end A session',
		request: (f) => ({ path: `/api/security/sessions/${f.alpha.ownerSessionId}` }),
		route: 'DELETE /api/security/sessions/:id',
		scope: 'user'
	},

	// Auth and passkeys: user-scoped or public, must keep working without a household.
	{
		beta: [200],
		loner: [200],
		name: 'reports own session',
		request: () => ({ path: '/api/auth/session' }),
		route: 'GET /api/auth/session',
		scope: 'user'
	},
	{
		beta: [401],
		loner: [401],
		name: 'cannot sign in as A owner',
		request: () => ({ body: { password: 'not-the-password!', username: A_OWNER }, path: '/api/auth/sign-in' }),
		route: 'POST /api/auth/sign-in',
		scope: 'public'
	},
	{
		beta: [200],
		loner: [200],
		name: 'signs out only itself',
		request: () => ({ path: '/api/auth/sign-out' }),
		route: 'POST /api/auth/sign-out',
		scope: 'user'
	},
	{
		beta: [200],
		loner: [200],
		name: 'renames only itself',
		request: () => ({ body: { displayName: 'Новое имя' }, path: '/api/auth/display-name' }),
		route: 'PUT /api/auth/display-name',
		scope: 'user'
	},
	{
		beta: [200],
		loner: [200],
		name: 'starts a passkey sign-in',
		request: () => ({ path: '/api/auth/passkey/sign-in/options' }),
		route: 'POST /api/auth/passkey/sign-in/options',
		scope: 'public'
	},
	{
		beta: [400, 401],
		loner: [400, 401],
		name: 'cannot finish a passkey sign-in with a forged answer',
		request: (f) => ({
			body: { id: f.alpha.ownerPasskeyId, rawId: f.alpha.ownerPasskeyId, response: {}, type: 'public-key' },
			path: '/api/auth/passkey/sign-in/verification'
		}),
		route: 'POST /api/auth/passkey/sign-in/verification',
		scope: 'public'
	},
	{
		beta: [200],
		loner: [200],
		name: 'starts own passkey registration',
		request: () => ({ path: '/api/auth/passkey/registration/options' }),
		route: 'POST /api/auth/passkey/registration/options',
		scope: 'user'
	},
	{
		beta: [400],
		loner: [400],
		name: 'cannot finish a passkey registration with a forged answer',
		request: () => ({ body: {}, path: '/api/auth/passkey/registration/verification' }),
		route: 'POST /api/auth/passkey/registration/verification',
		scope: 'user'
	},
	{ beta: [200], loner: [200], name: 'health', request: () => ({ path: '/api/health' }), route: 'GET /api/health', scope: 'public' },

	// Telegram webhook: called by Telegram, not by a user. It ignores the session cookie entirely, its credential is
	// the secret header, and it reads or writes no household data (A2: updates go to the dispatcher only). A session
	// of B or of the user without a household must neither open it nor let it touch household A.
	{
		beta: [401],
		loner: [401],
		name: 'a user session is not a webhook credential',
		request: () => ({ body: { update_id: 1 }, path: '/api/telegram/webhook' }),
		route: 'POST /api/telegram/webhook',
		scope: 'public'
	},
	{
		beta: [200],
		loner: [200],
		name: 'an authentic update does not touch household data',
		request: () => ({
			body: { update_id: 2 },
			headers: { 'x-telegram-bot-api-secret-token': TELEGRAM_WEBHOOK_SECRET },
			path: '/api/telegram/webhook'
		}),
		route: 'POST /api/telegram/webhook',
		scope: 'public'
	},

	// Telegram sign-in (A3): open routes that create a session, so they must work without one and without a household,
	// and must not answer anything about a user (nor of household A) before a request is confirmed in the bot.
	{
		beta: [200],
		loner: [200],
		name: 'starts a sign-in that reveals nobody',
		request: () => ({ path: '/api/auth/telegram/start' }),
		route: 'POST /api/auth/telegram/start',
		scope: 'public'
	},
	{
		beta: [403],
		loner: [403],
		name: 'a session cookie does not complete someone else\'s sign-in',
		request: () => ({ body: { code: UNKNOWN_LOGIN_CODE }, path: '/api/auth/telegram/complete' }),
		route: 'POST /api/auth/telegram/complete',
		scope: 'public'
	},
	{
		beta: [200],
		loner: [200],
		name: 'cancels nothing that is not its own',
		request: () => ({ body: { code: UNKNOWN_LOGIN_CODE }, path: '/api/auth/telegram/cancel' }),
		route: 'POST /api/auth/telegram/cancel',
		scope: 'public'
	},
	{
		beta: [410],
		loner: [410],
		name: 'dev confirmation of an unknown code changes nothing, even as the Telegram of A member',
		request: () => ({
			body: { code: UNKNOWN_LOGIN_CODE, firstName: 'Захват', telegramId: '2002' },
			path: '/api/dev/telegram/confirm',
			peerAddress: '127.0.0.1'
		}),
		route: 'POST /api/dev/telegram/confirm',
		scope: 'public'
	},
	{
		beta: [404],
		loner: [404],
		name: 'dev confirmation does not exist for a peer in the network, whatever Host and Origin say',
		request: () => ({
			body: { code: UNKNOWN_LOGIN_CODE, firstName: 'Захват', telegramId: '2002' },
			headers: { host: 'localhost:3001', origin: 'http://localhost:3001' },
			path: '/api/dev/telegram/confirm',
			peerAddress: '192.168.1.23'
		}),
		route: 'POST /api/dev/telegram/confirm',
		scope: 'public'
	}
];

/**
 * Explicit exceptions: routes that are knowingly not isolated yet. `GET /api/public/categories` serves the
 * categories of `default-household` without a session (CORS `*`) to the old external OCR pipeline. The spec closes
 * it (Р8, A8), but the owner has not answered whether anyone still needs it (section 10, item 3), so it stays open.
 * The exception test below pins the current behaviour: closing the route must update this list on purpose.
 */
const KNOWN_EXCEPTIONS = [
	'GET /api/public/categories',
	'OPTIONS /api/public/categories'
];

let createApp: typeof CreateApiApp;
let createDependencies: typeof CreateApiDependencies;
let toAppDependencies: typeof ToApiAppDependencies;
let sessionCookieName: string;
let imageRoot: string;
let connection: Database.Database;
let database: AppDatabase;
let app: ReturnType<typeof CreateApiApp>;
let fixture: Fixture;

beforeAll(async () => {
	imageRoot = mkdtempSync(join(tmpdir(), 'i-finances-isolation-'));
	vi.stubEnv('DATABASE_URL', ':memory:');
	vi.stubEnv('AUTH_ORIGIN', ORIGIN);
	vi.stubEnv('MCP_API_KEY', MCP_API_KEY);
	vi.stubEnv('MCP_USER_ID', A_OWNER);
	vi.stubEnv('RECEIPT_IMAGE_ROOT', imageRoot);
	// Webhook mode registers POST /api/telegram/webhook and the dev confirmation POST /api/dev/telegram/confirm: the
	// most routes the server can have. The bot client is the fake one (`createApiDependencies` option); the runner is
	// never started, and fetch is stubbed anyway.
	vi.stubEnv('DEV_TELEGRAM_LOGIN', 'true');
	vi.stubEnv('TELEGRAM_UPDATES', 'webhook');
	vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:isolation-test-token');
	vi.stubEnv('TELEGRAM_BOT_USERNAME', 'i_finances_test_bot');
	vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', TELEGRAM_WEBHOOK_SECRET);
	// The rate refresh calls the National Bank; tests must never reach the network.
	vi.stubGlobal('fetch', async () => {
		throw new Error('Network access is disabled in tests.');
	});
	vi.resetModules();
	delete (globalThis as { iFinancesSqlite?: unknown }).iFinancesSqlite;

	// Imported only after DATABASE_URL points to memory: the composition root opens the configured database.
	({ createApiApp: createApp } = await import('@/app'));
	({ createApiDependencies: createDependencies, toApiAppDependencies: toAppDependencies } = await import('@/composition-root'));
	sessionCookieName = (await import('@/modules/auth')).getAuthConfig().sessionCookieName;
	receiptPng = await sharp({
		create: { background: { b: 255, g: 255, r: 255 }, channels: 3, height: 8, width: 8 }
	}).png().toBuffer();
});

afterAll(async () => {
	(await import('@/infrastructure/database/client')).sqlite.close();
	delete (globalThis as { iFinancesSqlite?: unknown }).iFinancesSqlite;
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	rmSync(imageRoot, { force: true, recursive: true });
});

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	// Exactly how main.ts builds the server app, so a route registered only there is part of the coverage check.
	app = createApp(toAppDependencies(createDependencies(database, { telegramBotClient: new FakeTelegramBotClient() })));
	fixture = await seed();
});

afterEach(() => {
	connection.close();
});

function tokenOf(userId: string): string {
	return `${userId}-token-0123456789abcdef`;
}

function headersFor(userId: string | undefined, json: boolean): Record<string, string> {
	return {
		...(json ? { 'content-type': 'application/json' } : {}),
		...(userId === undefined ? {} : { cookie: `${sessionCookieName}=${tokenOf(userId)}` }),
		origin: ORIGIN
	};
}

async function call(userId: string | undefined, route: string, request: ProbeRequest): Promise<Response> {
	const method = route.slice(0, route.indexOf(' '));

	const nodeBindings = request.peerAddress === undefined
		? undefined
		: { incoming: { socket: { remoteAddress: request.peerAddress } } };

	if (request.form !== undefined) {
		return app.request(request.path, {
			body: await request.form(),
			headers: { ...headersFor(userId, false), ...request.headers },
			method
		}, nodeBindings);
	}

	return app.request(request.path, {
		body: request.body === undefined ? undefined : JSON.stringify(request.body),
		headers: { ...headersFor(userId, request.body !== undefined), ...request.headers },
		method
	}, nodeBindings);
}

async function created(userId: string, path: string, body: unknown, key: string): Promise<Entity> {
	const response = await call(userId, `POST ${path}`, { body, path });
	const json = await response.json() as Record<string, Entity>;

	expect(response.status, `${path}: ${JSON.stringify(json)}`).toBe(200);

	return { id: json[key].id, version: json[key].version };
}

async function seed(): Promise<Fixture> {
	const at = new Date(NOW - DAY);
	const people: Array<[string, string]> = [
		[A_OWNER, 'Альфа Владелец'],
		[A_MEMBER, 'Альфа Участница'],
		[B_OWNER, 'Бета Владелец'],
		[LONER, 'Без окружения']
	];

	await database.insert(users).values(people.map(([id, displayName]) => ({
		createdAt: at,
		displayName,
		id,
		isActive: true,
		passwordHash: null,
		updatedAt: at,
		username: id
	})));
	await database.insert(households).values([
		{ baseCurrency: 'BYN', createdAt: at, id: A_HOUSEHOLD, name: 'Альфа Семья', updatedAt: at },
		{ baseCurrency: 'BYN', createdAt: at, id: B_HOUSEHOLD, name: 'Бета Семья', updatedAt: at }
	]);
	await database.insert(householdMembers).values([
		{ householdId: A_HOUSEHOLD, joinedAt: at, role: 'owner', userId: A_OWNER },
		{ householdId: A_HOUSEHOLD, joinedAt: at, role: 'member', userId: A_MEMBER },
		{ householdId: B_HOUSEHOLD, joinedAt: at, role: 'owner', userId: B_OWNER }
	]);
	await database.insert(telegramAccounts).values({
		chatId: '2002',
		firstName: 'Альфа',
		lastName: null,
		lastSignInAt: at,
		linkedAt: at,
		telegramId: '2002',
		updatedAt: at,
		userId: A_MEMBER,
		username: 'alfa_member'
	});
	await database.insert(sessions).values([
		...people.map(([userId]) => ({
			createdAt: at,
			expiresAt: new Date(NOW + DAY),
			id: `${userId}-session`,
			lastSeenAt: new Date(NOW),
			tokenHash: hashSessionToken(tokenOf(userId)),
			userId
		})),
		...[B_OWNER, LONER].map((userId) => ({
			createdAt: at,
			expiresAt: new Date(NOW + DAY),
			id: `${userId}-session-2`,
			lastSeenAt: new Date(NOW),
			tokenHash: hashSessionToken(`${tokenOf(userId)}-second-device`),
			userId
		}))
	]);
	await database.insert(webauthnCredentials).values([A_OWNER, B_OWNER, LONER].map((userId) => ({
		backedUp: false,
		counter: 0,
		createdAt: at,
		deviceType: 'singleDevice',
		id: `${userId}-passkey`,
		publicKey: 'cHVibGljLWtleQ',
		userId
	})));

	const alphaAccount = await created(A_OWNER, '/api/accounts', accountBody('Альфа карта'), 'account');
	const alphaAccount2 = await created(A_OWNER, '/api/accounts', accountBody('Альфа наличные'), 'account');
	const alphaCategory = await created(A_OWNER, '/api/categories', categoryBody('Альфа продукты', 'альфа-ключ'), 'category');
	const alphaContact = await created(A_OWNER, '/api/contacts', contactBody('Альфа магазин'), 'contact');
	// The member records the operation: members have full access to the household data (Р6).
	const alphaOperation = await created(A_MEMBER, '/api/operations', operationBody({
		accountId: alphaAccount.id,
		amountMinor: A_AMOUNT_MINOR,
		categoryId: alphaCategory.id,
		contactId: alphaContact.id,
		title: 'Альфа покупка'
	}), 'operation');
	const alphaTransfer = await created(A_OWNER, '/api/transfers', transferBody(alphaAccount.id, alphaAccount2.id), 'transfer');
	const receiptResponse = await call(A_OWNER, 'POST /api/receipt-imports', { form: receiptForm, path: '/api/receipt-imports' });
	const receiptJson = await receiptResponse.json() as { receiptImport: { id: string } };

	expect(receiptResponse.status, JSON.stringify(receiptJson)).toBe(201);

	const receiptRow = connection.prepare('SELECT version FROM receipt_imports WHERE id = ?')
		.get(receiptJson.receiptImport.id) as { version: number };

	return {
		alpha: {
			account: alphaAccount,
			account2: alphaAccount2,
			category: alphaCategory,
			contact: alphaContact,
			operation: alphaOperation,
			ownerPasskeyId: `${A_OWNER}-passkey`,
			ownerSessionId: `${A_OWNER}-session`,
			receipt: { id: receiptJson.receiptImport.id, version: receiptRow.version },
			transfer: alphaTransfer
		},
		beta: {
			account: await created(B_OWNER, '/api/accounts', accountBody('Бета карта'), 'account'),
			account2: await created(B_OWNER, '/api/accounts', accountBody('Бета наличные'), 'account'),
			category: await created(B_OWNER, '/api/categories', categoryBody('Бета продукты', 'бета-ключ'), 'category'),
			contact: await created(B_OWNER, '/api/contacts', contactBody('Бета магазин'), 'contact')
		}
	};
}

type DatabaseState = {
	/** Rows of household A, serialized; compared as a whole before and after a probe. */
	alphaRows: string[];
	/** Every id of a household A row. */
	alphaIds: Set<string>;
	/** Rows that do not belong to household A, serialized. */
	otherRows: string[];
};

function isIdColumn(column: string): boolean {
	return column === 'id' || column.endsWith('_id');
}

/**
 * Splits the whole database into rows of household A and the rest, without a per-table list: a row belongs to A
 * when any of its id columns holds an id of A, starting from the household, its users, and growing to a fixpoint
 * (an operation belongs to A through its household, a receipt link through its receipt, a keyword through its
 * category). A new table is therefore covered automatically.
 */
function readDatabaseState(): DatabaseState {
	const tables = (connection.prepare(
		'SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'sqlite_%\' AND name NOT LIKE \'__drizzle%\''
	).all() as Array<{ name: string }>).map(({ name }) => name);
	const rows = tables.flatMap((table) => (connection.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>)
		.map((row) => ({ row, table })));
	const alphaIds = new Set([A_HOUSEHOLD, A_OWNER, A_MEMBER]);
	const owned = new Set<number>();
	let grew = true;

	while (grew) {
		grew = false;
		rows.forEach(({ row }, index) => {
			if (owned.has(index)) {
				return;
			}

			const idValues = Object.entries(row).filter(([column, value]) => isIdColumn(column) && typeof value === 'string');

			if (idValues.some(([, value]) => alphaIds.has(value as string))) {
				owned.add(index);
				grew = true;

				if (typeof row.id === 'string') {
					alphaIds.add(row.id);
				}
			}
		});
	}

	const serialize = ({ row, table }: { row: Record<string, unknown>; table: string }) => `${table} ${JSON.stringify(row)}`;

	return {
		alphaIds,
		alphaRows: rows.filter((_, index) => owned.has(index)).map(serialize).sort(),
		otherRows: rows.filter((_, index) => !owned.has(index)).map(serialize)
	};
}

function findAlphaTraces(text: string, alphaIds: Set<string>, allowedIds: Set<string>): string[] {
	const traces = [...alphaIds].filter((id) => !allowedIds.has(id) && text.includes(id));
	const markers = [
		...(A_MARKER.test(text) ? ['marker «Альфа»'] : []),
		...(A_AMOUNT_MARKER.test(text) ? [`amount ${A_AMOUNT_MINOR} of household A`] : [])
	];

	return [...traces, ...markers];
}

/**
 * The same request with every id of household A replaced by an id that exists nowhere, so the answers to «someone
 * else's» and «does not exist» can be compared.
 */
function withMissingIds(request: ProbeRequest, alphaIds: Set<string>): ProbeRequest {
	// Longest first: `alpha-owner` is a prefix of `alpha-owner-passkey`.
	const ids = [...idsInRequest(alphaIds, request)].sort((left, right) => right.length - left.length);
	const replace = (text: string) => ids.reduce((result, id) => result.split(id).join(randomUUID()), text);

	return {
		body: request.body === undefined ? undefined : JSON.parse(replace(JSON.stringify(request.body))) as unknown,
		form: request.form,
		path: replace(request.path)
	};
}

function idsInRequest(alphaIds: Set<string>, request: ProbeRequest): Set<string> {
	const text = `${request.path} ${JSON.stringify(request.body ?? null)}`;

	return new Set([...alphaIds].filter((id) => text.includes(id)));
}

const ALPHA_PLACEHOLDER_ID = 'alpha-placeholder-id';

/**
 * Tells, before the database exists, whether a probe sends ids of household A: its request is built from a fixture
 * where every id of A is a placeholder.
 */
function sendsAlphaIds(probe: Probe): boolean {
	const alpha = { id: ALPHA_PLACEHOLDER_ID, version: 1 };
	const beta = { id: 'beta-placeholder-id', version: 1 };
	const request = probe.request({
		alpha: {
			account: alpha,
			account2: alpha,
			category: alpha,
			contact: alpha,
			operation: alpha,
			ownerPasskeyId: ALPHA_PLACEHOLDER_ID,
			ownerSessionId: ALPHA_PLACEHOLDER_ID,
			receipt: alpha,
			transfer: alpha
		},
		beta: { account: beta, account2: beta, category: beta, contact: beta }
	});
	const text = `${request.path} ${JSON.stringify(request.body ?? null)}`;

	return [ALPHA_PLACEHOLDER_ID, A_HOUSEHOLD, A_OWNER, A_MEMBER].some((id) => text.includes(id));
}

function actorUser(actor: Actor): string {
	return actor === 'beta' ? B_OWNER : LONER;
}

describe('household isolation over every route', () => {
	it('every registered route has a probe (or is a listed exception), and every probe names a real route', () => {
		const registered = [...new Set(app.routes
			.filter((route) => route.method !== 'ALL')
			.map((route) => `${route.method} ${route.path}`))].sort();
		const probed = [...new Set([...PROBES.map((probe) => probe.route), ...KNOWN_EXCEPTIONS])].sort();

		// Guards the setup itself: the app is the full server app (every optional controller wired, as in main.ts).
		expect(registered).toContain('POST /api/telegram/webhook');
		expect(registered).toContain('POST /api/dev/telegram/confirm');
		expect(probed).toEqual(registered);
	});

	const cases = PROBES.flatMap((probe) => (['beta', 'loner'] as const).map((actor) => ({ actor, probe })));

	it.each(cases)('$probe.route as $actor: $probe.name', async ({ actor, probe }) => {
		const before = readDatabaseState();
		const request = probe.request(fixture);
		const response = await call(actorUser(actor), probe.route, request);
		const text = await response.text();
		const after = readDatabaseState();
		const allowedIds = idsInRequest(before.alphaIds, request);

		if (actor === 'loner' && probe.scope === 'household') {
			expect(response.status, text).toBe(403);
			expect(JSON.parse(text)).toMatchObject({ errorCode: 'household-required', ok: false });
		}
		else {
			const expected = actor === 'beta' ? probe.beta : probe.loner;

			expect(expected, `${probe.route}: expected statuses for ${actor} are missing`).toBeDefined();
			expect(expected, text).toContain(response.status);
			expect(text).not.toContain('household-required');
		}

		expect(findAlphaTraces(text, before.alphaIds, allowedIds), `response leaks household A: ${text}`).toEqual([]);
		expect(after.alphaRows, 'household A data changed').toEqual(before.alphaRows);
		expect(
			after.otherRows.filter((row) => findAlphaTraces(row, before.alphaIds, new Set()).length > 0),
			'household A data was copied into another row'
		).toEqual([]);
	});

	// No existence oracle: an id of household A must be answered exactly like an id that does not exist anywhere.
	it.each(PROBES.filter(sendsAlphaIds))(
		'$route as beta: «$name» answers like a missing id',
		async (probe) => {
			const { alphaIds } = readDatabaseState();
			const request = probe.request(fixture);
			const foreign = await call(B_OWNER, probe.route, request);
			const missing = await call(B_OWNER, probe.route, withMissingIds(request, alphaIds));

			expect(idsInRequest(alphaIds, request).size, 'the probe sends no id of household A').toBeGreaterThan(0);
			expect(`${missing.status} ${await missing.text()}`).toBe(`${foreign.status} ${await foreign.text()}`);
		}
	);

	it('KNOWN EXCEPTION: GET /api/public/categories still serves household A categories without a session', async () => {
		const response = await app.request('/api/public/categories');

		expect(response.status).toBe(200);
		expect(await response.text()).toMatch(A_MARKER);
	});
});

describe('existing users keep working', () => {
	it('the owner and the member of household A read and write its data as before', async () => {
		for (const userId of [A_OWNER, A_MEMBER]) {
			const accounts = await call(userId, 'GET /api/accounts', { path: '/api/accounts' });
			const accountIds = ((await accounts.json()) as { items: Array<{ id: string }> }).items.map((item) => item.id);

			expect(accounts.status).toBe(200);
			expect(accountIds.sort()).toEqual([fixture.alpha.account.id, fixture.alpha.account2.id].sort());
			expect((await call(userId, 'GET /api/operations/balances', { path: '/api/operations/balances' })).status).toBe(200);
			expect((await call(userId, 'GET /api/exchange-rates/current', { path: '/api/exchange-rates/current' })).status).toBe(200);
		}

		await created(A_MEMBER, '/api/categories', categoryBody('Альфа кафе', 'альфа-кафе'), 'category');
	});

	it('the session reports the household and role, null without one', async () => {
		const expectations: Array<[string, unknown]> = [
			[A_OWNER, { id: A_HOUSEHOLD, name: 'Альфа Семья', role: 'owner' }],
			[A_MEMBER, { id: A_HOUSEHOLD, name: 'Альфа Семья', role: 'member' }],
			[B_OWNER, { id: B_HOUSEHOLD, name: 'Бета Семья', role: 'owner' }],
			[LONER, null]
		];

		for (const [userId, household] of expectations) {
			const response = await call(userId, 'GET /api/auth/session', { path: '/api/auth/session' });

			expect(await response.json()).toMatchObject({ authenticated: true, household, user: { id: userId } });
		}
	});

	it('only the owner renames the household', async () => {
		const member = await call(A_MEMBER, 'PUT /api/household', { body: { name: 'Захват' }, path: '/api/household' });
		const owner = await call(A_OWNER, 'PUT /api/household', { body: { name: 'Альфа Дом' }, path: '/api/household' });

		expect(member.status).toBe(403);
		expect(await member.json()).toMatchObject({ errorCode: 'owner-required' });
		expect(owner.status).toBe(200);
		expect(await owner.json()).toMatchObject({ household: { members: [{}, {}], name: 'Альфа Дом', role: 'owner' } });
	});

	it('the MCP key user (MCP_USER_ID = A owner) works as before', async () => {
		const bearer = { authorization: `Bearer ${MCP_API_KEY}`, 'content-type': 'application/json', origin: ORIGIN };
		const accounts = await app.request('/api/accounts', { headers: bearer });
		const session = await app.request('/api/auth/session', { headers: bearer });
		const operation = await app.request('/api/operations', {
			body: JSON.stringify(operationBody({
				accountId: fixture.alpha.account.id,
				categoryId: null,
				contactId: null,
				title: 'Через MCP'
			})),
			headers: bearer,
			method: 'POST'
		});

		expect(accounts.status).toBe(200);
		expect((await accounts.json() as { items: unknown[] }).items).toHaveLength(2);
		expect(await session.json()).toMatchObject({ household: { id: A_HOUSEHOLD, role: 'owner' }, user: { id: A_OWNER } });
		expect(operation.status).toBe(200);
	});

	it('the MCP key does not manage the household: /api/household accepts the browser session only', async () => {
		const bearer = { authorization: `Bearer ${MCP_API_KEY}`, 'content-type': 'application/json', origin: ORIGIN };
		const before = readDatabaseState();

		for (const method of ['GET', 'POST', 'PUT']) {
			const response = await app.request('/api/household', {
				body: method === 'GET' ? undefined : JSON.stringify({ name: 'Через MCP' }),
				headers: bearer,
				method
			});

			expect(response.status, method).toBe(401);
			expect(await response.json()).toMatchObject({ errorCode: 'unauthenticated', ok: false });
		}

		expect(readDatabaseState()).toEqual(before);
	});

	it('a user without a household is never added to one implicitly', async () => {
		const before = connection.prepare('SELECT household_id, user_id, role FROM household_members ORDER BY user_id').all();

		for (const path of ['/api/accounts', '/api/categories', '/api/operations/balances', '/api/household']) {
			expect((await call(LONER, `GET ${path}`, { path })).status).toBe(403);
		}

		expect(connection.prepare('SELECT household_id, user_id, role FROM household_members ORDER BY user_id').all()).toEqual(before);
	});
});
