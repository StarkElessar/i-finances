import { action, query, revalidate } from '@solidjs/router';
import { getWebRequest } from '@solidjs/start/http';
import type { z } from 'zod';

import type {
    AccountCommandResult,
    ChangeAccountArchiveStateInput,
    CreateAccountInput,
    UpdateAccountInput
} from './account.contract';
import {
    changeAccountArchiveStateInputSchema,
    createAccountInputSchema,
    updateAccountInputSchema
} from './account.contract';

import type { PersistedAccount } from '~/entities/account/model/types';
import {
    getAccountBalances,
    getAccountLedger,
    getMonthlyExpenseSummary
} from '~/entities/operation/api/operation.server';
import {
    AccountCurrencyCorrectionConflictError,
    AccountCurrencyCorrectionRequiredError,
    AccountNotFoundError,
    AccountVersionConflictError
} from '~/server/account/account-errors';
import { createAccountRepository } from '~/server/account/account-repository';
import { createAccountService } from '~/server/account/account-service';
import {
    assertSameOriginMutation,
    InvalidMutationOriginError
} from '~/server/auth/csrf/origin-guard';
import {
    AuthenticationRequiredError,
    requireUser
} from '~/server/auth/require-user';
import { ExchangeRateNotFoundError } from '~/server/exchange-rate/exchange-rate-errors';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import { createExchangeRateService } from '~/server/exchange-rate/exchange-rate-service';
import { createHouseholdRepository } from '~/server/household/household-repository';
import {
    createHouseholdResolver,
    HouseholdAccessRequiredError,
    HouseholdSelectionRequiredError
} from '~/server/household/household-service';
import { createOperationAccountCurrencyCorrector } from '~/server/operation/account-currency-corrector';

const exchangeRateResolver = createExchangeRateService({
    exchangeRateRepository: createExchangeRateRepository()
});
const accountService = createAccountService({
    accountCurrencyCorrector: createOperationAccountCurrencyCorrector({
        exchangeRateResolver
    }),
    accountRepository: createAccountRepository(),
    householdResolver: createHouseholdResolver(createHouseholdRepository())
});

/**
 * Loads accounts available to the current household.
 */
async function readAccounts(includeArchived = false) {
    'use server';

    const session = await requireUser();

    return accountService.list(session.user.id, includeArchived);
}

export const getAccounts = query(readAccounts, 'accounts');

/**
 * Converts Zod errors to the flat field shape consumed by forms.
 */
function createFieldErrors(error: z.ZodError): Record<string, string> {
    const fieldErrors: Record<string, string> = {};

    error.issues.forEach((issue) => {
        const field = issue.path[0];

        if (typeof field === 'string') {
            fieldErrors[field] = issue.message;
        }
    });

    return fieldErrors;
}

/**
 * Maps known domain and request failures to a stable action result.
 */
function createAccountFailure(error: unknown): AccountCommandResult | undefined {
    if (error instanceof AuthenticationRequiredError) {
        return {
            errorCode: 'unauthenticated',
            message: 'Требуется войти в приложение.',
            ok: false
        };
    }

    if (
        error instanceof InvalidMutationOriginError
        || error instanceof HouseholdAccessRequiredError
    ) {
        return {
            errorCode: 'forbidden',
            message: 'Недостаточно прав для изменения счетов.',
            ok: false
        };
    }

    if (
        error instanceof AccountVersionConflictError
        || error instanceof AccountCurrencyCorrectionConflictError
        || error instanceof HouseholdSelectionRequiredError
    ) {
        return {
            errorCode: 'conflict',
            message: 'Данные изменились. Обновите список счетов и повторите действие.',
            ok: false
        };
    }

    if (error instanceof AccountNotFoundError) {
        return {
            errorCode: 'not-found',
            message: 'Счёт не найден.',
            ok: false
        };
    }

    if (error instanceof AccountCurrencyCorrectionRequiredError) {
        return {
            errorCode: 'confirmation-required',
            message: 'Подтвердите пересчет истории в новой валюте счета.',
            ok: false
        };
    }

    if (error instanceof ExchangeRateNotFoundError) {
        return {
            errorCode: 'rate-unavailable',
            message: 'Для одной или нескольких дат операций отсутствует курс.',
            ok: false
        };
    }

    return undefined;
}

/**
 * Executes one validated account command in the authenticated request context.
 */
async function executeAccountCommand<TInput>(
    schema: z.ZodType<TInput>,
    input: TInput,
    command: (userId: string, value: TInput) => Promise<PersistedAccount>
): Promise<AccountCommandResult> {
    const parsedInput = schema.safeParse(input);

    if (parsedInput.success) {
        try {
            assertSameOriginMutation(getWebRequest());

            const session = await requireUser();
            const account = await command(session.user.id, parsedInput.data);

            await Promise.all([
                revalidate(getAccounts.key),
                revalidate(getAccountBalances.key),
                revalidate(getAccountLedger.key),
                revalidate(getMonthlyExpenseSummary.key)
            ]);

            return {
                account,
                ok: true
            };
        }
        catch (error: unknown) {
            const failure = createAccountFailure(error);

            if (failure) {
                return failure;
            }

            throw error;
        }
    }

    return {
        errorCode: 'invalid-input',
        fieldErrors: createFieldErrors(parsedInput.error),
        message: 'Проверьте поля счёта.',
        ok: false
    };
}

async function createAccountCommand(
    input: CreateAccountInput
): Promise<AccountCommandResult> {
    'use server';

    return executeAccountCommand(
        createAccountInputSchema,
        input,
        accountService.create
    );
}

async function updateAccountCommand(
    input: UpdateAccountInput
): Promise<AccountCommandResult> {
    'use server';

    return executeAccountCommand(
        updateAccountInputSchema,
        input,
        accountService.update
    );
}

async function archiveAccountCommand(
    input: ChangeAccountArchiveStateInput
): Promise<AccountCommandResult> {
    'use server';

    return executeAccountCommand(
        changeAccountArchiveStateInputSchema,
        input,
        accountService.archive
    );
}

async function restoreAccountCommand(
    input: ChangeAccountArchiveStateInput
): Promise<AccountCommandResult> {
    'use server';

    return executeAccountCommand(
        changeAccountArchiveStateInputSchema,
        input,
        accountService.restore
    );
}

export const createAccount = action(createAccountCommand, 'create-account');
export const updateAccount = action(updateAccountCommand, 'update-account');
export const archiveAccount = action(archiveAccountCommand, 'archive-account');
export const restoreAccount = action(restoreAccountCommand, 'restore-account');
