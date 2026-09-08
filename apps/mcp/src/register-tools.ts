import type { ApiClient } from '@/api-client';
import { ApiRequestError } from '@/api-client';
import { parseAmountToMinor } from '@/parse-amount';

import type {
	AccountCollection,
	CategoryCollectionResponse,
	ContactCollection,
	CurrentExchangeRates,
	OperationCommandResult
} from '@i-finances/contracts';
import { CATEGORY_LIST_STATUSES, CONTACT_LIST_STATUSES, operationTypeSchema } from '@i-finances/contracts';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function toolText(value: unknown): { content: Array<{ text: string; type: 'text' }> } {
	return { content: [{ text: JSON.stringify(value, null, 2), type: 'text' }] };
}

function toolError(message: string): { content: Array<{ text: string; type: 'text' }>; isError: true } {
	return { content: [{ text: `Error: ${message}`, type: 'text' }], isError: true };
}

function describeApiError(error: unknown): string {
	if (error instanceof ApiRequestError) {
		const body = error.body as { message?: string } | undefined;

		return body?.message ?? `API request failed with status ${error.status}`;
	}

	return error instanceof Error ? error.message : String(error);
}

export function registerTools(server: McpServer, apiClient: ApiClient): void {
	server.registerTool(
		'list_categories',
		{
			description:
				'Lists household expense categories with their ids, names and keywords. '
				+ 'Use it to resolve a human category name to the id required when recording an operation.',
			inputSchema: {
				status: z.enum(CATEGORY_LIST_STATUSES)
					.default('active')
					.describe('Which categories to return. Defaults to active only.')
			},
			title: 'List categories'
		},
		async ({ status }) => {
			try {
				const collection = await apiClient.get('/api/categories', { status }) as CategoryCollectionResponse;

				return toolText({
					baseCurrency: collection.baseCurrency,
					categories: collection.items.map((category) => ({
						archivedAt: category.archivedAt,
						id: category.id,
						keywords: category.keywords,
						monthlyBudgetMinor: category.monthlyBudgetMinor,
						name: category.name
					})),
					count: collection.items.length
				});
			}
			catch (error: unknown) {
				return toolError(describeApiError(error));
			}
		}
	);

	server.registerTool(
		'list_contacts',
		{
			description:
				'Lists household contacts (people, companies, shops) with their ids and names. '
				+ 'Use it to resolve a payee name to the id required when recording an operation.',
			inputSchema: {
				status: z.enum(CONTACT_LIST_STATUSES)
					.default('active')
					.describe('Which contacts to return. Defaults to active only.')
			},
			title: 'List contacts'
		},
		async ({ status }) => {
			try {
				const collection = await apiClient.get('/api/contacts', { status }) as ContactCollection;

				return toolText({
					baseCurrency: collection.baseCurrency,
					contacts: collection.items.map((contact) => ({
						archivedAt: contact.archivedAt,
						id: contact.id,
						legalName: contact.legalName,
						name: contact.name,
						phone: contact.phone,
						type: contact.type
					})),
					count: collection.items.length
				});
			}
			catch (error: unknown) {
				return toolError(describeApiError(error));
			}
		}
	);

	server.registerTool(
		'list_accounts',
		{
			description:
				'Lists household accounts with their ids, names, currencies and types. '
				+ 'Use it to resolve an account for recording an operation.',
			inputSchema: {},
			title: 'List accounts'
		},
		async () => {
			try {
				const collection = await apiClient.get('/api/accounts') as AccountCollection;

				return toolText({
					accounts: collection.items
						.filter((account) => account.archivedAt === null)
						.map((account) => ({
							currency: account.currency,
							id: account.id,
							name: account.name,
							type: account.type
						})),
					baseCurrency: collection.baseCurrency,
					count: collection.items.length
				});
			}
			catch (error: unknown) {
				return toolError(describeApiError(error));
			}
		}
	);

	server.registerTool(
		'get_exchange_rates',
		{
			description:
				"Returns today's exchange rates for every household currency relative to the base currency. "
				+ 'Check this before recording an operation in a foreign currency.',
			inputSchema: {},
			title: 'Get exchange rates'
		},
		async () => {
			try {
				const rates = await apiClient.get('/api/exchange-rates/current') as CurrentExchangeRates;

				return toolText(rates);
			}
			catch (error: unknown) {
				return toolError(describeApiError(error));
			}
		}
	);

	server.registerTool(
		'add_expense',
		{
			description:
				'Records a new financial operation (expense or income) in the household ledger. '
				+ 'Always resolve accountId via list_accounts and categoryId via list_categories first.',
			inputSchema: {
				accountId: z.string().describe('Account id. Resolve with list_accounts.'),
				amount: z.string().describe('Amount as a decimal string, e.g. "47.90". Converted to minor units automatically.'),
				categoryId: z.string().nullable().default(null)
					.describe('Category id. Resolve with list_categories. Pass null to leave uncategorised.'),
				comment: z.string().default('').describe('Optional note.'),
				contactId: z.string().nullable().default(null).describe('Contact id. Resolve with list_contacts. Pass null if no payee.'),
				happenedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Date in YYYY-MM-DD. Defaults to today.'),
				title: z.string().describe('Short description, e.g. "Продукты в Ашане".'),
				type: operationTypeSchema.default('expense').describe('Operation type: expense or income.')
			},
			title: 'Add expense / income'
		},
		async ({ accountId, amount, categoryId, comment, contactId, happenedOn, title, type }) => {
			let amountMinor: number;

			try {
				amountMinor = parseAmountToMinor(amount);
			}
			catch (error: unknown) {
				return toolError(describeApiError(error));
			}

			try {
				const result = await apiClient.post('/api/operations', {
					accountId,
					amountMinor,
					categoryId,
					comment,
					contactId,
					happenedOn: happenedOn ?? localDate(),
					title,
					type
				}) as OperationCommandResult;

				if (!result.ok) {
					return toolError(result.message);
				}

				return toolText({
					amountMinor: result.operation.amountMinor,
					categoryId: result.operation.categoryId,
					categoryName: result.operation.categoryName,
					currency: result.operation.currency,
					happenedOn: result.operation.happenedOn,
					id: result.operation.id,
					title: result.operation.title,
					type: result.operation.type,
					version: result.operation.version
				});
			}
			catch (error: unknown) {
				return toolError(describeApiError(error));
			}
		}
	);

	server.registerTool(
		'update_expense',
		{
			description:
				'Replaces an existing financial operation. Every field is required — the API has no '
				+ 'partial-update or single-record lookup, so fetch the current values first (e.g. from '
				+ 'a recent list_categories/list_contacts-resolved add_expense result or the web ledger) '
				+ 'and resend them unchanged alongside the fields you want to change. Cannot move an '
				+ 'operation to a different account or currency.',
			inputSchema: {
				amount: z.string().describe('Amount as a decimal string, e.g. "47.90".'),
				categoryId: z.string().nullable().describe('Category id, or null to clear it.'),
				comment: z.string().describe('Comment. Pass "" for none.'),
				contactId: z.string().nullable().describe('Contact id, or null to clear it.'),
				happenedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD.'),
				id: z.string().describe('Operation id to update.'),
				title: z.string().describe('Short description.'),
				type: operationTypeSchema.describe('Operation type: expense or income.'),
				version: z.number().int().positive().describe('Current operation version, for optimistic locking.')
			},
			title: 'Update expense / income'
		},
		async ({ amount, categoryId, comment, contactId, happenedOn, id, title, type, version }) => {
			let amountMinor: number;

			try {
				amountMinor = parseAmountToMinor(amount);
			}
			catch (error: unknown) {
				return toolError(describeApiError(error));
			}

			try {
				const result = await apiClient.put(`/api/operations/${encodeURIComponent(id)}`, {
					amountMinor,
					categoryId,
					comment,
					contactId,
					happenedOn,
					title,
					type,
					version
				}) as OperationCommandResult;

				if (!result.ok) {
					return toolError(result.message);
				}

				return toolText({
					amountMinor: result.operation.amountMinor,
					categoryId: result.operation.categoryId,
					categoryName: result.operation.categoryName,
					comment: result.operation.comment,
					contactId: result.operation.contactId,
					contactName: result.operation.contactName,
					currency: result.operation.currency,
					happenedOn: result.operation.happenedOn,
					id: result.operation.id,
					title: result.operation.title,
					type: result.operation.type,
					version: result.operation.version
				});
			}
			catch (error: unknown) {
				return toolError(describeApiError(error));
			}
		}
	);
}

function localDate(): string {
	return new Intl.DateTimeFormat('sv', { timeZone: 'Europe/Minsk' }).format(new Date());
}
