import type { AccountClient } from '@/features/accounts/api';
import { resolveAccountError } from '@/features/accounts/lib';
import { readAccountFields, updateAccount } from '@/features/accounts/model';

import type { AccountCollection, PersistedAccount } from '@i-finances/contracts';
import { createResource, createSignal, Show } from 'solid-js';

import { AccountForm } from './account-form';
import { AccountList } from './account-list';

export type AccountsViewProps = {
	client: AccountClient;
};

export function AccountsView(props: AccountsViewProps) {
	const [includeArchived, setIncludeArchived] = createSignal(false);
	const [accounts, { refetch }] = createResource<AccountCollection>(
		() => props.client.list(includeArchived())
	);
	const [editingAccount, setEditingAccount] = createSignal<PersistedAccount>();
	const [message, setMessage] = createSignal<string>();
	const [error, setError] = createSignal<string>();

	const handleSubmit = async (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
		event.preventDefault();
		setMessage(undefined);
		setError(undefined);

		const formData = new FormData(event.currentTarget);
		const editing = editingAccount();
		const fields = readAccountFields(formData);

		if (fields === undefined) {
			setError('Проверьте сумму начального остатка.');
			return;
		}

		try {
			const result = editing === undefined
				? await props.client.create(fields)
				: await updateAccount(props.client, editing, fields, false);

			if (!result.ok && result.errorCode === 'confirmation-required' && editing !== undefined) {
				if (!window.confirm('Смена валюты перепишет исторические суммы операций. Продолжить?')) {
					return;
				}

				const confirmed = await updateAccount(props.client, editing, fields, true);

				if (!confirmed.ok) {
					setError(confirmed.message);
					return;
				}
			}
			else if (!result.ok) {
				setError(result.message);
				return;
			}

			setMessage(editing === undefined ? 'Счёт создан.' : 'Счёт обновлён.');
			setEditingAccount(undefined);
			event.currentTarget.reset();
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveAccountError(caughtError));
		}
	};

	const handleArchive = async (account: PersistedAccount) => {
		setMessage(undefined);
		setError(undefined);

		try {
			const result = account.archivedAt === null
				? await props.client.archive({ id: account.id, version: account.version })
				: await props.client.restore({ id: account.id, version: account.version });

			if (!result.ok) {
				setError(result.message);
				return;
			}

			setMessage(account.archivedAt === null ? 'Счёт архивирован.' : 'Счёт восстановлен.');
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveAccountError(caughtError));
		}
	};

	return (
		<section aria-labelledby='accounts-title' class='accounts-panel'>
			<div class='section-heading'>
				<div>
					<p class='eyebrow'>Следующий web-срез</p>
					<h2 id='accounts-title'>Счета</h2>
				</div>
				<label class='toggle-label'>
					<input
						checked={includeArchived()}
						onChange={(event) => setIncludeArchived(event.currentTarget.checked)}
						type='checkbox'
					/>
					Показывать архив
				</label>
			</div>

			<Show when={message()}>
				{(currentMessage) => <p class='account-success' role='status'>{currentMessage()}</p>}
			</Show>
			<Show when={error()}>
				{(currentError) => <p class='account-error' role='alert'>{currentError()}</p>}
			</Show>

			<Show when={!accounts.loading} fallback={<p role='status'>Загрузка счетов…</p>}>
				<Show when={accounts()} fallback={<p role='alert'>Не удалось загрузить счета.</p>}>
					{(collection) => (
						<AccountList
							collection={collection()}
							onArchive={handleArchive}
							onEdit={setEditingAccount}
						/>
					)}
				</Show>
			</Show>

			<AccountForm
				account={editingAccount()}
				onCancel={() => setEditingAccount(undefined)}
				onSubmit={handleSubmit}
			/>
		</section>
	);
}
