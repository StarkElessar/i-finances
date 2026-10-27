import { Combobox } from '@/shared/ui/combobox';

import type { OperationAccountFieldState } from './lib/resolve-operation-account-field';
import { AccountOptionContent } from './account-option-content';

type OperationAccountFieldProps = {
	/** Server error for the field (409 `fieldErrors.accountId`); it replaces the hint and draws the red frame. */
	error?: string;
	field: OperationAccountFieldState;
	/** The form is saving. */
	loading?: boolean;
	onChange: (accountId: string) => void;
};

/**
 * The «Счёт» field of the edit form: moves the operation to another active account of the same currency
 * (boards `M-OpMoveAccount`, `D-OpMoveAccount`).
 */
export function OperationAccountField(props: OperationAccountFieldProps) {
	return (
		<Combobox
			clearable={false}
			disabled={props.loading || props.field.disabled}
			error={props.error}
			getOptionDisabled={(option) => option.archived}
			getOptionLabel={(option) => option.name}
			getOptionValue={(option) => option.id}
			hint={props.field.hint}
			label='Счёт'
			options={props.field.options}
			searchPlaceholder='Название счёта'
			value={props.field.selected.id}
			renderOption={(option) => <AccountOptionContent current={option.id === props.field.current.id} option={option}/>}
			renderValue={(option) => <AccountOptionContent compact current={option.id === props.field.current.id} option={option}/>}
			onChange={(value) => {
				if (value !== null) {
					props.onChange(value);
				}
			}}
		/>
	);
}
