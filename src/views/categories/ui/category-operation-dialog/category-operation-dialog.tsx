import css from './category-operation-dialog.module.scss';

import { Dialog } from '~/shared/ui';

import { getAccounts } from '~/entities/account/api';
import type { PersistedCategory } from '~/entities/category';
import { getContacts } from '~/entities/contact';
import type {
	CategoryOperation,
	OperationDraft
} from '~/entities/operation';
import {
	deleteOperationAction,
	recalculateOperationRateAction,
	updateOperationAction
} from '~/entities/operation';

import { OperationDetailsForm } from '~/views/home/ui/operation-details-panel';

import { createAsync, useAction, useSubmission } from '@solidjs/router';
import {
	createEffect,
	createMemo,
	createSignal,
	createUniqueId,
	Show
} from 'solid-js';

/**
 * Controlled dialog that edits a category-summary operation with the shared form.
 */
export type CategoryOperationDialogProps = {
	categories: readonly PersistedCategory[];
	open: boolean;
	operation: CategoryOperation | undefined;
	onOpenChange: (open: boolean) => void;
};

/**
 * Nested edit dialog for an operation opened from the category period report.
 */
export function CategoryOperationDialog(props: CategoryOperationDialogProps) {
	const titleId = createUniqueId();
	const [error, setError] = createSignal<string>();
	const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>();
	const [editingOperation, setEditingOperation] = createSignal<CategoryOperation>();
	const runDeleteOperation = useAction(deleteOperationAction);
	const runRecalculateOperationRate = useAction(recalculateOperationRateAction);
	const runUpdateOperation = useAction(updateOperationAction);
	const deleteSubmission = useSubmission(deleteOperationAction);
	const recalculateSubmission = useSubmission(recalculateOperationRateAction);
	const updateSubmission = useSubmission(updateOperationAction);

	const accounts = createAsync(async () => {
		if (props.open) {
			return getAccounts(true);
		}
	});
	const contacts = createAsync(async () => {
		if (props.open) {
			return getContacts({ status: 'all' });
		}
	});

	const isMutationPending = () => Boolean(
		deleteSubmission.pending
		|| recalculateSubmission.pending
		|| updateSubmission.pending
	);
	const isContextLoading = () => (
		props.open
		&& (accounts() === undefined || contacts() === undefined)
	);
	const activeCategories = createMemo(() => (
		props.categories.filter((category) => category.archivedAt === null)
	));
	const account = createMemo(() => {
		const operation = editingOperation();
		const accountList = accounts();

		if (operation === undefined || accountList === undefined) {
			return undefined;
		}

		return accountList.find((item) => item.id === operation.accountId);
	});
	const formContext = createMemo(() => {
		const currentAccount = account();
		const operation = editingOperation();

		if (currentAccount === undefined || operation === undefined) {
			return undefined;
		}

		return {
			account: currentAccount,
			operation
		};
	});

	const resetErrors = () => {
		setError(undefined);
		setFieldErrors(undefined);
	};

	const handleOpenChange = (open: boolean) => {
		if (isMutationPending()) {
			return;
		}

		props.onOpenChange(open);

		if (!open) {
			resetErrors();
			setEditingOperation(undefined);
		}
	};

	const handleClose = () => {
		handleOpenChange(false);
	};

	const handleSubmit = async (value: OperationDraft) => {
		const operation = editingOperation();

		if (operation === undefined) {
			return;
		}

		resetErrors();

		try {
			const result = await runUpdateOperation({
				...value,
				id: operation.id,
				version: operation.version
			});

			if (result.ok) {
				handleOpenChange(false);
				return;
			}

			setError(result.message);
			setFieldErrors(result.fieldErrors);
		}
		catch {
			setError(
				'Не удалось сохранить операцию. Проверьте подключение и повторите попытку.'
			);
		}
	};

	const handleDelete = async () => {
		const operation = editingOperation();

		if (operation === undefined) {
			return;
		}

		resetErrors();

		try {
			const result = await runDeleteOperation({
				id: operation.id,
				version: operation.version
			});

			if (result.ok) {
				handleOpenChange(false);
				return;
			}

			setError(result.message);
		}
		catch {
			setError(
				'Не удалось удалить операцию. Проверьте подключение и повторите попытку.'
			);
		}
	};

	const handleRecalculateRate = async () => {
		const operation = editingOperation();

		if (operation === undefined) {
			return;
		}

		resetErrors();

		try {
			const result = await runRecalculateOperationRate({
				id: operation.id,
				version: operation.version
			});

			if (result.ok) {
				setEditingOperation({
					...operation,
					...result.operation,
					accountName: operation.accountName
				});
				return;
			}

			setError(result.message);
		}
		catch {
			setError(
				'Не удалось пересчитать курс операции. Повторите попытку.'
			);
		}
	};

	createEffect(() => {
		if (props.open && props.operation) {
			setEditingOperation(props.operation);
			resetErrors();
		}
	});

	return (
		<Dialog.Root
			class={css.root}
			closeOnBackdropClick={!isMutationPending()}
			closeOnEscape={!isMutationPending()}
			open={props.open}
			onOpenChange={handleOpenChange}
		>
			<Dialog.Content
				aria-labelledby={titleId}
				class={css.content}
			>
				<Show
					fallback={(
						<div aria-busy='true' class={css.loadingState} role='status'>
							Загрузка формы…
						</div>
					)}
					when={!isContextLoading()}
				>
					<Show
						fallback={(
							<div class={css.missingState} role='alert'>
								Счёт операции недоступен. Обновите данные и повторите попытку.
							</div>
						)}
						when={formContext()}
					>
						{(context) => (
							<div class={css.formHost}>
								<OperationDetailsForm
									account={context().account}
									categories={activeCategories()}
									contacts={contacts()?.items ?? []}
									error={error()}
									fieldErrors={fieldErrors()}
									loading={isMutationPending()}
									mode='edit'
									operation={context().operation}
									titleId={titleId}
									onClose={handleClose}
									onDelete={handleDelete}
									onRecalculateRate={handleRecalculateRate}
									onSubmit={handleSubmit}
								/>
							</div>
						)}
					</Show>
				</Show>
			</Dialog.Content>
		</Dialog.Root>
	);
}
