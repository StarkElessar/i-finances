import { formatMinorUnits } from '@/features/operations/model';
import { readOperationFields } from '@/features/operations/model';

import type {
	AccountBalance,
	CreateOperationInput,
	OperationType,
	PersistedCategory,
	PersistedContact,
	PersistedOperation
} from '@i-finances/contracts';
import { createEffect, createSignal, For, Show } from 'solid-js';

export type OperationFormProps = {
	accountId: string;
	accounts: AccountBalance[];
	categories: PersistedCategory[];
	contacts: PersistedContact[];
	error: string | undefined;
	operation: PersistedOperation | undefined;
	onArchive: () => Promise<void>;
	onCancel: () => void;
	onRecalculateRate: () => Promise<void>;
	onRestore: () => Promise<void>;
	onSubmit: (input: CreateOperationInput) => Promise<void>;
};

export function OperationForm(props: OperationFormProps) {
	const [amount, setAmount] = createSignal('');
	const [categoryId, setCategoryId] = createSignal<string>('');
	const [comment, setComment] = createSignal('');
	const [contactId, setContactId] = createSignal<string>('');
	const [happenedOn, setHappenedOn] = createSignal(getDateOffset(0));
	const [title, setTitle] = createSignal('');
	const [type, setType] = createSignal<OperationType>('expense');
	const [formError, setFormError] = createSignal<string>();

	createEffect(() => {
		const operation = props.operation;

		if (operation === undefined) {
			setAmount('');
			setCategoryId('');
			setComment('');
			setContactId('');
			setHappenedOn(getDateOffset(0));
			setTitle('');
			setType('expense');
		}
		else {
			setAmount(formatMinorUnits(operation.amountMinor));
			setCategoryId(operation.categoryId ?? '');
			setComment(operation.comment);
			setContactId(operation.contactId ?? '');
			setHappenedOn(operation.happenedOn);
			setTitle(operation.title);
			setType(operation.type);
		}

		setFormError(undefined);
	});

	const handleSubmit = async (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
		event.preventDefault();
		setFormError(undefined);

		const input = readOperationFields(
			new FormData(event.currentTarget),
			props.operation?.accountId ?? props.accountId
		);

		if (input === undefined) {
			setFormError('Проверьте сумму, дату и обязательные поля операции.');
			return;
		}

		await props.onSubmit(input);
	};

	const selectedAccount = () => props.accounts.find((account) => account.accountId === props.accountId);
	const categoryOptions = () => props.categories.filter((category) => (
		category.archivedAt === null || category.id === props.operation?.categoryId
	));
	const contactOptions = () => props.contacts.filter((contact) => (
		contact.archivedAt === null || contact.id === props.operation?.contactId
	));
	const usesExchangeRate = () => props.operation !== undefined
		&& props.operation.exchangeRate.fromCurrency !== props.operation.exchangeRate.toCurrency;

	return (
		<form class='operation-form' onSubmit={handleSubmit}>
			<div class='section-heading'>
				<div>
					<h3>{props.operation === undefined ? 'Новая операция' : 'Редактирование операции'}</h3>
					<Show when={selectedAccount()}>
						{(account) => <small>{account().accountId} · {account().currency}</small>}
					</Show>
				</div>
				<Show when={props.operation}>
					<button class='link-button' onClick={props.onCancel} type='button'>Отмена</button>
				</Show>
			</div>

			<label>
				<span>Тип</span>
				<select name='type' onChange={(event) => setType(event.currentTarget.value as OperationType)} value={type()}>
					<option value='expense'>Расход</option>
					<option value='income'>Доход</option>
				</select>
			</label>
			<label>
				<span>Сумма</span>
				<input
					inputmode='decimal'
					name='amount'
					onInput={(event) => setAmount(event.currentTarget.value)}
					required
					value={amount()}
				/>
			</label>
			<label>
				<span>Название</span>
				<input name='title' onInput={(event) => setTitle(event.currentTarget.value)} required value={title()}/>
			</label>
			<label>
				<span>Дата</span>
				<input
					name='happenedOn'
					onInput={(event) => setHappenedOn(event.currentTarget.value)}
					required
					type='date'
					value={happenedOn()}
				/>
			</label>
			<label>
				<span>Категория</span>
				<select name='categoryId' onChange={(event) => setCategoryId(event.currentTarget.value)} value={categoryId()}>
					<option value=''>Без категории</option>
					<For each={categoryOptions()}>
						{(category) => <option value={category.id}>{category.name}{category.archivedAt === null ? '' : ' (архив)'}</option>}
					</For>
				</select>
			</label>
			<label>
				<span>Контакт</span>
				<select name='contactId' onChange={(event) => setContactId(event.currentTarget.value)} value={contactId()}>
					<option value=''>Без контакта</option>
					<For each={contactOptions()}>
						{(contact) => <option value={contact.id}>{contact.name}{contact.archivedAt === null ? '' : ' (архив)'}</option>}
					</For>
				</select>
			</label>
			<label>
				<span>Комментарий</span>
				<textarea maxlength='1000' name='comment' onInput={(event) => setComment(event.currentTarget.value)} value={comment()}/>
			</label>

			<Show when={formError() ?? props.error}>
				{(error) => <p class='operation-error' role='alert'>{error()}</p>}
			</Show>

			<div class='operation-form-actions'>
				<button type='submit'>{props.operation === undefined ? 'Создать операцию' : 'Сохранить операцию'}</button>
				<Show when={props.operation}>
					{(operation) => (
						<>
							<button
								class='secondary-button'
								onClick={operation().deletedAt === null ? props.onArchive : props.onRestore}
								type='button'
							>
								{operation().deletedAt === null ? 'В архив' : 'Восстановить'}
							</button>
							<Show when={usesExchangeRate()}>
								<button class='secondary-button' onClick={props.onRecalculateRate} type='button'>Пересчитать курс</button>
							</Show>
						</>
					)}
				</Show>
			</div>
		</form>
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
