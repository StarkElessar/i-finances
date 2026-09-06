import { randomUUID } from 'node:crypto';

import { createCreateTransferUseCase } from './use-cases/create-transfer';
import { createGetTransferUseCase } from './use-cases/get-transfer';
import { createSoftDeleteTransferUseCase } from './use-cases/soft-delete-transfer';
import { createUpdateTransferUseCase } from './use-cases/update-transfer';
import { createTransferRules } from './transfer-rules';
import type {
	TransferService,
	TransferServiceDependencies
} from './transfer-service.types';

export type {
	TransferService,
	TransferServiceDependencies
} from './transfer-service.types';

/**
 * Composes transfer use cases from injected domain and persistence adapters.
 */
export function createTransferService(
	dependencies: TransferServiceDependencies
): TransferService {
	const context = {
		accountRepository: dependencies.accountRepository,
		contactRepository: dependencies.contactRepository,
		createId: dependencies.createId ?? randomUUID,
		exchangeRateResolver: dependencies.exchangeRateResolver,
		householdResolver: dependencies.householdResolver,
		now: dependencies.now ?? (() => new Date()),
		rules: createTransferRules(dependencies),
		transferRepository: dependencies.transferRepository
	};

	return {
		create: createCreateTransferUseCase(context),
		getById: createGetTransferUseCase(context),
		softDelete: createSoftDeleteTransferUseCase(context),
		update: createUpdateTransferUseCase(context)
	};
}
