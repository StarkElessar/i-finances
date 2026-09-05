import type { CategoryClient } from '@/features/categories';
import type { ContactClient } from '@/features/contacts';
import type { OperationClient } from '@/features/operations/api';
import { resolveOperationError } from '@/features/operations/lib';
import { updateOperation } from '@/features/operations/model';

import type {
	AccountBalance,
	AccountLedger,
	CategoryCollection,
	ContactCollection,
	CreateOperationInput,
	PersistedOperation
} from '@i-finances/contracts';
import { createEffect, createResource, createSignal, Show } from 'solid-js';

import { OperationBalances } from './operation-balances';
import { OperationForm } from './operation-form';
import { OperationLedger } from './operation-ledger';

export type OperationsViewProps = {
	categoryClient: CategoryClient;
	client: OperationClient;
	contactClient: ContactClient;
};

export function OperationsView(props: OperationsViewProps) {
	const [balances, { refetch: refetchBalances }] = createResource<AccountBalance[]>(
		() => props.client.balances()
	);
	const [categories] = createResource<CategoryCollection>(
		() => props.categoryClient.list('all')
	);
	const [contacts] = createResource<ContactCollection>(
		() => props.contactClient.list('all')
	);
	const [selectedAccountId, setSelectedAccountId] = createSignal<string>();
	const [start, setStart] = createSignal(getDateOffset(-30));
	const [end, setEnd] = createSignal(getDateOffset(0));
	const [editingOperation, setEditingOperation] = createSignal<PersistedOperation>();
	const [message, setMessage] = createSignal<string>();
	const [error, setError] = createSignal<string>();
	const [ledger, { refetch: refetchLedger }] = createResource<AccountLedger | undefined>(
		() => {
			const accountId = selectedAccountId();

			if (accountId === undefined) {
				return undefined;
			}

			return props.client.ledger({
				accountId,
				end: end(),
				start: start()
			});
		}
	);

	createEffect(() => {
		if (selectedAccountId() === undefined) {
			const firstAccount = balances()?.[0];

			if (firstAccount !== undefined) {
				setSelectedAccountId(firstAccount.accountId);
			}
		}
	});

	const refreshData = async () => {
		await Promise.all([refetchBalances(), refetchLedger()]);
	};

	const handleAccountChange = (event: Event & { currentTarget: HTMLSelectElement }) => {
		setSelectedAccountId(event.currentTarget.value || undefined);
		setEditingOperation(undefined);
	};

	const handleSelectOperation = (operation: PersistedOperation) => {
		setEditingOperation(operation);
		setMessage(undefined);
		setError(undefined);
	};

	const handleSubmit = async (input: CreateOperationInput) => {
		setMessage(undefined);
		setError(undefined);

		try {
			const operation = editingOperation();
			const result = operation === undefined
				? await props.client.create(input)
				: await updateOperation(props.client, operation, input);

			if (!result.ok) {
				setError(result.message);
				return;
			}

			setMessage(operation === undefined ? 'Операция создана.' : 'Операция обновлена.');
			setEditingOperation(undefined);
			await refreshData();
		}
		catch (caughtError: unknown) {
			setError(resolveOperationError(caughtError));
		}
	};

	const handleArchive = async () => {
		const operation = editingOperation();

		if (operation === undefined) {
			return;
		}

		setMessage(undefined);
		setError(undefined);

		try {
			const result = operation.deletedAt === null
				? await props.client.archive({ id: operation.id, version: operation.version })
				: await props.client.restore({ id: operation.id, version: operation.version });

			if (!result.ok) {
				setError(result.message);
				return;
			}

			setMessage(operation.deletedAt === null ? 'Операция архивирована.' : 'Операция восстановлена.');
			setEditingOperation(undefined);
			await refreshData();
		}
		catch (caughtError: unknown) {
			setError(resolveOperationError(caughtError));
		}
	};

	const handleRecalculateRate = async () => {
		const operation = editingOperation();

		if (operation === undefined) {
			return;
		}

		setMessage(undefined);
		setError(undefined);

		try {
			const result = await props.client.recalculateRate({
				id: operation.id,
				version: operation.version
			});

			if (!result.ok) {
				setError(result.message);
				return;
			}

			setMessage('Курс операции пересчитан.');
			setEditingOperation(undefined);
			await refreshData();
		}
		catch (caughtError: unknown) {
			setError(resolveOperationError(caughtError));
		}
	};

	return (
		<section aria-labelledby='operations-title' class='operations-panel'>
			<div class='section-heading'>
				<div>
					<p class='eyebrow'>Следующий web-срез</p>
					<h2 id='operations-title'>Операции</h2>
				</div>
				<Show when={selectedAccountId()}>
					<button class='secondary-button' onClick={() => setEditingOperation(undefined)} type='button'>Новая операция</button>
				</Show>
			</div>

			<Show when={message()}>
				{(currentMessage) => <p class='operation-success' role='status'>{currentMessage()}</p>}
			</Show>
			<Show when={error()}>
				{(currentError) => <p class='operation-error' role='alert'>{currentError()}</p>}
			</Show>

			<Show when={!balances.loading} fallback={<p role='status'>Загрузка остатков…</p>}>
				<Show when={balances()} fallback={<p role='alert'>Не удалось загрузить остатки.</p>}>
					{(items) => (
						<>
							<OperationBalances items={items()}/>
							<label>
								<span>Счёт для журнала</span>
								<select onChange={handleAccountChange} value={selectedAccountId() ?? ''}>
									<option value=''>Выберите счёт</option>
									{items().map((item) => <option value={item.accountId}>{item.accountId}</option>)}
								</select>
							</label>
							<div class='operation-period'>
								<label>
									<span>С</span>
									<input onInput={(event) => setStart(event.currentTarget.value)} type='date' value={start()}/>
								</label>
								<label>
									<span>По</span>
									<input onInput={(event) => setEnd(event.currentTarget.value)} type='date' value={end()}/>
								</label>
							</div>
							<Show when={!ledger.loading} fallback={<p role='status'>Загрузка журнала…</p>}>
								<Show when={!ledger.error} fallback={<p role='alert'>Не удалось загрузить журнал.</p>}>
									<OperationLedger ledger={ledger()} onSelect={handleSelectOperation}/>
								</Show>
							</Show>
							<Show when={selectedAccountId() !== undefined}>
								<Show
									when={categories() !== undefined && contacts() !== undefined}
									fallback={<p role='status'>Загрузка справочников…</p>}
								>
									<OperationForm
										accountId={selectedAccountId() ?? ''}
										accounts={items()}
										categories={categories()?.items ?? []}
										contacts={contacts()?.items ?? []}
										error={error()}
										operation={editingOperation()}
										onArchive={handleArchive}
										onCancel={() => setEditingOperation(undefined)}
										onRecalculateRate={handleRecalculateRate}
										onRestore={handleArchive}
										onSubmit={handleSubmit}
									/>
								</Show>
							</Show>
						</>
					)}
				</Show>
			</Show>
		</section>
	);
}

function getDateOffset(days: number): string {
	const date = new Date();

	date.setDate(date.getDate() + days);

	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-');
}
