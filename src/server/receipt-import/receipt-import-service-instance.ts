import { createAccountRepository } from '~/server/account/account-repository';
import { createCategoryRepository } from '~/server/category/category-repository';
import { createContactRepository } from '~/server/contact/contact-repository';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import { createExchangeRateService } from '~/server/exchange-rate/exchange-rate-service';
import { createHouseholdRepository } from '~/server/household/household-repository';
import { createHouseholdResolver } from '~/server/household/household-service';
import { createOperationRepository } from '~/server/operation/operation-repository';
import { createOperationService } from '~/server/operation/operation-service';
import { createReceiptImageStorage } from '~/server/receipt-import/receipt-image-storage';
import { createReceiptImportRepository } from '~/server/receipt-import/receipt-import-repository';
import { createReceiptImportService } from '~/server/receipt-import/receipt-import-service';

const householdResolver = createHouseholdResolver(
	createHouseholdRepository()
);
const accountRepository = createAccountRepository();
const exchangeRateResolver = createExchangeRateService({
	exchangeRateRepository: createExchangeRateRepository()
});

/**
 * Shared receipt import service used by UI actions and HTTP worker endpoints.
 */
export const receiptImportService = createReceiptImportService({
	accountRepository,
	categoryRepository: createCategoryRepository(),
	householdResolver,
	imageStorage: createReceiptImageStorage(),
	operationService: createOperationService({
		accountRepository,
		categoryRepository: createCategoryRepository(),
		contactRepository: createContactRepository(),
		exchangeRateResolver,
		householdResolver,
		operationRepository: createOperationRepository()
	}),
	receiptImportRepository: createReceiptImportRepository()
});
