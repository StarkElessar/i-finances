import {
	type AccountCollection,
	accountCommandResultSchema,
	type AccountType,
	accountTypeSchema,
	createAccountInputSchema,
	type PersistedAccount,
	updateAccountInputSchema
} from '@i-finances/contracts';
import { createResource, createSignal, For, Show } from 'solid-js';

import { ApiHttpError } from '../../../shared/api';
import type { AccountClient } from '../api';

export type AccountsViewProps = {
	client: AccountClient;
};

const accountTypeLabels: Record<AccountType, string> = {
	card: 'Карта',
	cash: 'Наличные',
	other: 'Другое',
	savings: 'Сбережения'
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
					{(collection) => <AccountList collection={collection()} onArchive={handleArchive} onEdit={setEditingAccount}/>}
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

type AccountListProps = {
	collection: AccountCollection;
	onArchive: (account: PersistedAccount) => Promise<void>;
	onEdit: (account: PersistedAccount) => void;
};

function AccountList(props: AccountListProps) {
	return (
		<Show
			when={props.collection.items.length > 0}
			fallback={<p>Счетов пока нет.</p>}
		>
			<ul class='account-list'>
				<For each={props.collection.items}>
					{(account) => (
						<li class='account-item'>
							<span
								aria-hidden='true'
								class='account-color'
								style={{ 'background-color': account.color }}
							/>
							<div class='account-item-content'>
								<strong>{account.name}</strong>
								<small>{accountTypeLabels[account.type]} · {account.currency} · версия {account.version}</small>
							</div>
							<div class='account-item-actions'>
								<button class='secondary-button' onClick={() => props.onEdit(account)} type='button'>Изменить</button>
								<button class='secondary-button' onClick={() => props.onArchive(account)} type='button'>
									{account.archivedAt === null ? 'В архив' : 'Восстановить'}
								</button>
							</div>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}

type AccountFormProps = {
	account: PersistedAccount | undefined;
	onCancel: () => void;
	onSubmit: (event: SubmitEvent & { currentTarget: HTMLFormElement }) => Promise<void>;
};

function AccountForm(props: AccountFormProps) {
	return (
		<form class='account-form' onSubmit={props.onSubmit}>
			<div class='section-heading'>
				<h3>{props.account === undefined ? 'Новый счёт' : 'Изменить счёт'}</h3>
				<Show when={props.account !== undefined}>
					<button class='link-button' onClick={props.onCancel} type='button'>Отмена</button>
				</Show>
			</div>
			<label>
				<span>Название</span>
				<input name='name' required value={props.account?.name ?? ''}/>
			</label>
			<div class='account-form-grid'>
				<label>
					<span>Тип</span>
					<select name='type' value={props.account?.type ?? 'card'}>
						<For each={accountTypeSchema.options}>
							{(type) => <option value={type}>{accountTypeLabels[type]}</option>}
						</For>
					</select>
				</label>
				<label>
					<span>Валюта</span>
					<select name='currency' value={props.account?.currency ?? 'BYN'}>
						<option value='BYN'>BYN</option>
						<option value='USD'>USD</option>
						<option value='EUR'>EUR</option>
					</select>
				</label>
			</div>
			<label>
				<span>Начальный остаток</span>
				<input inputmode='decimal' name='initialBalance' value={formatMinorUnits(props.account?.initialBalanceMinor ?? 0)}/>
			</label>
			<label>
				<span>Описание</span>
				<textarea maxlength='160' name='description'>{props.account?.description ?? ''}</textarea>
			</label>
			<label class='color-field'>
				<span>Цвет</span>
				<input name='color' type='color' value={props.account?.color ?? '#2563eb'}/>
			</label>
			<label class='checkbox-field'>
				<input checked={props.account?.isIncludedInFamilyTotal ?? true} name='isIncludedInFamilyTotal' type='checkbox'/>
				<span>Включать в общий итог семьи</span>
			</label>
			<label class='checkbox-field'>
				<input checked={props.account?.isColorAccentEnabled ?? false} name='isColorAccentEnabled' type='checkbox'/>
				<span>Использовать цветовой акцент</span>
			</label>
			<button type='submit'>{props.account === undefined ? 'Создать счёт' : 'Сохранить счёт'}</button>
		</form>
	);
}

function readAccountFields(formData: FormData) {
	const initialBalance = parseMoneyToMinorUnits(readFormString(formData, 'initialBalance'));

	if (initialBalance === undefined) {
		return undefined;
	}

	const fields = {
		color: readFormString(formData, 'color'),
		currency: readFormString(formData, 'currency'),
		description: readFormString(formData, 'description'),
		initialBalanceMinor: initialBalance,
		isColorAccentEnabled: formData.get('isColorAccentEnabled') === 'on',
		isIncludedInFamilyTotal: formData.get('isIncludedInFamilyTotal') === 'on',
		name: readFormString(formData, 'name'),
		type: readFormString(formData, 'type')
	};

	const parsedFields = createAccountInputSchema.safeParse(fields);

	return parsedFields.success ? parsedFields.data : undefined;
}

async function updateAccount(
	client: AccountClient,
	account: PersistedAccount,
	fields: ReturnType<typeof createAccountInputSchema.parse>,
	confirmCurrencyCorrection: boolean
) {
	return client.update(updateAccountInputSchema.parse({
		...fields,
		confirmCurrencyCorrection,
		id: account.id,
		version: account.version
	}));
}

function resolveAccountError(error: unknown): string {
	if (error instanceof ApiHttpError) {
		const result = accountCommandResultSchema.safeParse(error.body);

		if (result.success && !result.data.ok) {
			return result.data.message;
		}
	}

	return 'Не удалось выполнить действие со счётом.';
}

function parseMoneyToMinorUnits(value: string): number | undefined {
	const normalized = value.trim().replace(/\s/g, '').replace(',', '.');

	if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
		return undefined;
	}

	const amount = Number(normalized);
	const minorUnits = Math.round(amount * 100);

	return Number.isSafeInteger(minorUnits) ? minorUnits : undefined;
}

function formatMinorUnits(value: number): string {
	return (value / 100).toFixed(2);
}

function readFormString(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}
