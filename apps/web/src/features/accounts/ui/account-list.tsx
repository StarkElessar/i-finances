import { accountTypeLabels } from '@/features/accounts/model';

import type { AccountCollection, PersistedAccount } from '@i-finances/contracts';
import { For, Show } from 'solid-js';

export type AccountListProps = {
	collection: AccountCollection;
	onArchive: (account: PersistedAccount) => Promise<void>;
	onEdit: (account: PersistedAccount) => void;
};

export function AccountList(props: AccountListProps) {
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
