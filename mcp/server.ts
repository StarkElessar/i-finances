import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

process.env.DATABASE_URL ??= resolve(projectRoot, 'data/i-finances.sqlite');

const { CATEGORY_LIST_STATUSES } = await import('~/entities/category/api/category.contract');
const { CONTACT_LIST_STATUSES } = await import('~/entities/contact/api/contact.contract');
const { OPERATION_TYPES } = await import('~/entities/operation/api/operation.contract');

const { createAccountRepository } = await import('~/server/account/account-repository');
const { createCategoryRepository } = await import('~/server/category/category-repository');
const { createCategoryService } = await import('~/server/category/category-service');
const { createContactRepository } = await import('~/server/contact/contact-repository');
const { createContactService } = await import('~/server/contact/contact-service');
const { ExchangeRateNotFoundError } = await import('~/server/exchange-rate/exchange-rate-errors');
const { createExchangeRateRepository } = await import('~/server/exchange-rate/exchange-rate-repository');
const { createExchangeRateService } = await import('~/server/exchange-rate/exchange-rate-service');
const { createHouseholdRepository } = await import('~/server/household/household-repository');
const { createHouseholdResolver } = await import('~/server/household/household-service');
const {
	OperationNotFoundError,
	OperationVersionConflictError
} = await import('~/server/operation/operation-errors');
const { createOperationRepository } = await import('~/server/operation/operation-repository');
const { createOperationService } = await import('~/server/operation/operation-service');

const userId = process.env.MCP_USER_ID;

if (userId === undefined || userId === '') {
	throw new Error('MCP_USER_ID is required to resolve the active household.');
}

const householdResolver = createHouseholdResolver(createHouseholdRepository());
const accountRepository = createAccountRepository();
const categoryRepository = createCategoryRepository();
const contactRepository = createContactRepository();
const exchangeRateService = createExchangeRateService({
	exchangeRateRepository: createExchangeRateRepository()
});

const operationRepository = createOperationRepository();

const categoryService = createCategoryService({ categoryRepository, householdResolver });
const contactService = createContactService({ contactRepository, householdResolver });
const operationService = createOperationService({
	accountRepository,
	categoryRepository,
	contactRepository,
	exchangeRateResolver: exchangeRateService,
	householdResolver,
	operationRepository
});

function localDate(): string {
	return new Intl.DateTimeFormat('sv', { timeZone: 'Europe/Minsk' }).format(new Date());
}

function parseAmountToMinor(amount: string): number {
	const normalized = amount.trim().replace(',', '.');
	const [intPart, fracPart = ''] = normalized.split('.');
	const integer = parseInt(intPart, 10);

	if (isNaN(integer) || integer < 0) {
		throw new Error(`Invalid amount: "${amount}"`);
	}

	const cents = parseInt((fracPart + '00').slice(0, 2), 10);
	return integer * 100 + cents;
}

const server = new McpServer({ name: 'i-finances', version: '0.1.0' });

server.registerTool(
	'list_categories',
	{
		description:
			'Lists household expense categories with their ids, names and keywords. '
			+ 'Use it to resolve a human category name to the id required when '
			+ 'recording an operation.',
		inputSchema: {
			status: z.enum(CATEGORY_LIST_STATUSES)
				.default('active')
				.describe('Which categories to return. Defaults to active only.')
		},
		title: 'List categories'
	},
	async ({ status }) => {
		const collection = await categoryService.list(userId, status);

		return {
			content: [
				{
					text: JSON.stringify(
						{
							baseCurrency: collection.baseCurrency,
							categories: collection.items.map((category) => ({
								archivedAt: category.archivedAt,
								id: category.id,
								keywords: category.keywords,
								monthlyBudgetMinor: category.monthlyBudgetMinor,
								name: category.name
							})),
							count: collection.items.length
						},
						null,
						2
					),
					type: 'text' as const
				}
			]
		};
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
		const collection = await contactService.list(userId, status);

		return {
			content: [
				{
					text: JSON.stringify(
						{
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
						},
						null,
						2
					),
					type: 'text' as const
				}
			]
		};
	}
);

server.registerTool(
	'list_accounts',
	{
		description: 'Lists household accounts with their ids, names, currencies and types. '
			+ 'Use it to resolve an account for recording an operation.',
		inputSchema: {},
		title: 'List accounts'
	},
	async () => {
		const household = await householdResolver.requireForUser(userId);
		const items = await accountRepository.list(household.id, false);

		return {
			content: [
				{
					text: JSON.stringify(
						{
							accounts: items.map((account) => ({
								currency: account.currency,
								id: account.id,
								name: account.name,
								type: account.type
							})),
							baseCurrency: household.baseCurrency,
							count: items.length
						},
						null,
						2
					),
					type: 'text' as const
				}
			]
		};
	}
);

server.registerTool(
	'get_exchange_rates',
	{
		description: 'Returns available exchange rates relative to the household base currency for a given date. '
			+ 'Covers currencies of all non-archived accounts. '
			+ 'Check this before recording an operation in a foreign currency.',
		inputSchema: {
			date: z.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional()
				.describe('Date in YYYY-MM-DD format. Defaults to today.')
		},
		title: 'Get exchange rates'
	},
	async ({ date }) => {
		const household = await householdResolver.requireForUser(userId);
		const onDate = date ?? localDate();
		const items = await accountRepository.list(household.id, false);
		const currencies = [...new Set(items.map((a) => a.currency))].filter(
			(c) => c !== household.baseCurrency
		);

		const results = await Promise.all(
			currencies.map(async (currency) => {
				try {
					const quote = await exchangeRateService.resolve({
						fromCurrency: currency,
						onDate,
						toCurrency: household.baseCurrency
					});
					return {
						currency,
						effectiveOn: quote.effectiveOn,
						rate: quote.rate,
						source: quote.source
					};
				}
				catch (error: unknown) {
					if (error instanceof ExchangeRateNotFoundError) {
						return { currency, rate: null };
					}

					throw error;
				}
			})
		);

		return {
			content: [
				{
					text: JSON.stringify(
						{
							baseCurrency: household.baseCurrency,
							date: onDate,
							rates: results
						},
						null,
						2
					),
					type: 'text' as const
				}
			]
		};
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
			categoryId: z.string().nullable().default(null).describe('Category id. Resolve with list_categories. Pass null to leave uncategorised.'),
			comment: z.string().default('').describe('Optional note.'),
			contactId: z.string().nullable().default(null).describe('Contact id. Resolve with list_contacts. Pass null if no payee.'),
			happenedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Date in YYYY-MM-DD. Defaults to today.'),
			title: z.string().describe('Short description, e.g. "Продукты в Ашане".'),
			type: z.enum(OPERATION_TYPES).default('expense').describe('Operation type: expense or income.')
		},
		title: 'Add expense / income'
	},
	async ({ accountId, amount, categoryId, comment, contactId, happenedOn, title, type }) => {
		let amountMinor: number;

		try {
			amountMinor = parseAmountToMinor(amount);
		}
		catch (error: unknown) {
			return {
				content: [{ text: `Error: ${(error as Error).message}`, type: 'text' as const }],
				isError: true
			};
		}

		try {
			const operation = await operationService.create(userId, {
				accountId,
				amountMinor,
				categoryId: categoryId ?? null,
				comment: comment ?? '',
				contactId: contactId ?? null,
				happenedOn: happenedOn ?? localDate(),
				title,
				type
			});

			return {
				content: [
					{
						text: JSON.stringify(
							{
								amountMinor: operation.amountMinor,
								categoryId: operation.categoryId,
								categoryName: operation.categoryName,
								currency: operation.currency,
								happenedOn: operation.happenedOn,
								id: operation.id,
								title: operation.title,
								type: operation.type
							},
							null,
							2
						),
						type: 'text' as const
					}
				]
			};
		}
		catch (error: unknown) {
			if (error instanceof ExchangeRateNotFoundError) {
				return {
					content: [{
						text: `Error: no exchange rate found for this currency/date. Run get_exchange_rates to check availability.`,
						type: 'text' as const
					}],
					isError: true
				};
			}

			throw error;
		}
	}
);

server.registerTool(
	'update_expense',
	{
		description:
			'Updates an existing financial operation. Only pass the fields that '
			+ 'need to change; everything else keeps its current value. Resolve '
			+ 'categoryId/contactId via list_categories/list_contacts first. Cannot '
			+ 'move an operation to a different account or currency.',
		inputSchema: {
			amount: z.string().optional().describe('New amount as a decimal string, e.g. "47.90". Omit to keep the current amount.'),
			categoryId: z.string().nullable().optional().describe('New category id, or null to clear it. Omit to keep the current category.'),
			comment: z.string().optional().describe('New comment. Omit to keep the current comment.'),
			contactId: z.string().nullable().optional().describe('New contact id, or null to clear it. Omit to keep the current contact.'),
			happenedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('New date in YYYY-MM-DD. Omit to keep the current date.'),
			id: z.string().describe('Operation id to update.'),
			title: z.string().optional().describe('New short description. Omit to keep the current title.'),
			type: z.enum(OPERATION_TYPES).optional().describe('New operation type. Omit to keep the current type.')
		},
		title: 'Update expense / income'
	},
	async ({ amount, categoryId, comment, contactId, happenedOn, id, title, type }) => {
		const household = await householdResolver.requireForUser(userId);
		const current = await operationRepository.findById(household.id, id);

		if (current === undefined) {
			return {
				content: [{ text: `Error: operation "${id}" not found.`, type: 'text' as const }],
				isError: true
			};
		}

		let amountMinor = current.amountMinor;

		if (amount !== undefined) {
			try {
				amountMinor = parseAmountToMinor(amount);
			}
			catch (error: unknown) {
				return {
					content: [{ text: `Error: ${(error as Error).message}`, type: 'text' as const }],
					isError: true
				};
			}
		}

		try {
			const operation = await operationService.update(userId, {
				amountMinor,
				categoryId: categoryId !== undefined ? categoryId : current.categoryId,
				comment: comment ?? current.comment,
				contactId: contactId !== undefined ? contactId : current.contactId,
				happenedOn: happenedOn ?? current.happenedOn,
				id,
				title: title ?? current.title,
				type: type ?? current.type,
				version: current.version
			});

			return {
				content: [
					{
						text: JSON.stringify(
							{
								amountMinor: operation.amountMinor,
								categoryId: operation.categoryId,
								categoryName: operation.categoryName,
								comment: operation.comment,
								contactId: operation.contactId,
								contactName: operation.contactName,
								currency: operation.currency,
								happenedOn: operation.happenedOn,
								id: operation.id,
								title: operation.title,
								type: operation.type,
								version: operation.version
							},
							null,
							2
						),
						type: 'text' as const
					}
				]
			};
		}
		catch (error: unknown) {
			if (error instanceof OperationNotFoundError) {
				return {
					content: [{ text: `Error: operation "${id}" not found.`, type: 'text' as const }],
					isError: true
				};
			}

			if (error instanceof OperationVersionConflictError) {
				return {
					content: [{
						text: 'Error: the operation was changed by someone else in the meantime. Re-read it and try again.',
						type: 'text' as const
					}],
					isError: true
				};
			}

			if (error instanceof ExchangeRateNotFoundError) {
				return {
					content: [{
						text: 'Error: no exchange rate found for this currency/date. Run get_exchange_rates to check availability.',
						type: 'text' as const
					}],
					isError: true
				};
			}

			throw error;
		}
	}
);

await server.connect(new StdioServerTransport());
