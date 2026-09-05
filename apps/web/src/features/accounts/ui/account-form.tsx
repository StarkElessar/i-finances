import {
	accountTypeLabels,
	formatMinorUnits
} from '@/features/accounts/model';

import {
	accountTypeSchema,
	type PersistedAccount
} from '@i-finances/contracts';
import { For, Show } from 'solid-js';

export type AccountFormProps = {
	account: PersistedAccount | undefined;
	onCancel: () => void;
	onSubmit: (event: SubmitEvent & { currentTarget: HTMLFormElement }) => Promise<void>;
};

export function AccountForm(props: AccountFormProps) {
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
