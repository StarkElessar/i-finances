import type { Account } from '~/entities/account';
import type { Category } from '~/entities/category';
import type { Contact } from '~/entities/contact';
import type {
    OperationFormValue,
    OperationWithBalance
} from '~/entities/operation';
import type { CurrencyCodeValue } from '~/shared/lib';

export type OperationDetailsPanelMode = 'create' | 'edit';

export type OperationDetailsPanelProps = {
    account: Account;
    categories: readonly Category[];
    contacts: readonly Contact[];
    defaultExchangeRate: string;
    familyCurrency: CurrencyCodeValue;
    mobile: boolean;
    mode: OperationDetailsPanelMode;
    onDelete: (operationId: string) => void;
    onOpenChange: (open: boolean) => void;
    onPresenceChange: (present: boolean) => void;
    onSubmit: (value: OperationFormValue) => void;
    open: boolean;
    operation?: OperationWithBalance;
};
