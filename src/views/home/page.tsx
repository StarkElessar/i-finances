import css from './home.module.scss';

import {
	amountToMinorUnits,
	cn,
	CurrencyCode,
	formatCurrency,
	formatDate,
	getAccountTypeMeta,
	minorUnitsToAmount,
	sumMoney
} from '~/shared/lib';
import { createRouteSearchParams } from '~/shared/routing';
import { AccountIcon, Button, Container } from '~/shared/ui';
import { Dialog } from '~/shared/ui/dialog';

import type { Account, PersistedAccount } from '~/entities/account';
import {
	createAccount as createAccountAction,
	getAccounts,
	updateAccount as updateAccountAction
} from '~/entities/account/api';
import type { CategoryCollection } from '~/entities/category';
import { getCategories } from '~/entities/category';
import type { ContactCollection } from '~/entities/contact';
import { getContacts } from '~/entities/contact';
import type {
	CurrentExchangeRates,
	ExchangeRateQuote
} from '~/entities/exchange-rate';
import { toCurrencyExchangeRates } from '~/entities/exchange-rate';
import { getCurrentExchangeRates } from '~/entities/exchange-rate/api';
import type {
	AccountBalance,
	OperationDraft,
	OperationPeriodMode,
	OperationWithBalance
} from '~/entities/operation';
import {
	createOperationAction,
	deleteOperationAction,
	formatLocalDateKey,
	getAccountBalances,
	recalculateOperationRateAction,
	resolveOperationPeriodSearchState,
	shiftOperationPeriod,
	updateOperationAction
} from '~/entities/operation';
import type { Transfer } from '~/entities/transfer';
import {
	createTransferAction,
	deleteTransferAction,
	getTransfer,
	updateTransferAction
} from '~/entities/transfer';

import { Title } from '@solidjs/meta';
import {
	createAsync,
	revalidate,
	useAction,
	useSubmission
} from '@solidjs/router';
import {
	CircleAlert,
	Pencil,
	Plus,
	RefreshCw,
	WalletCards
} from 'lucide-solid';
import type { Accessor, JSX } from 'solid-js';
import {
	createEffect,
	createMemo,
	createSignal,
	ErrorBoundary,
	For,
	onCleanup,
	onMount,
	Show
} from 'solid-js';

import { homeSearchParamsSchema } from './model/home-search-params';
import type { AccountDialogValue } from './ui/account-dialog';
import { AccountDialog } from './ui/account-dialog';
import type { OperationDetailsPanelMode } from './ui/operation-details-panel';
import { OperationDetailsPanel } from './ui/operation-details-panel';
import { OperationsTable } from './ui/operations-table';
import type {
	TransferDialogMode,
	TransferDialogSubmitValue
} from './ui/transfer-dialog';
import { TransferDialog } from './ui/transfer-dialog';

const FALLBACK_FAMILY_TOTAL_CURRENCY = CurrencyCode.BYN;
const DESKTOP_DETAILS_QUERY = '(min-width: 60.0625em)';

const ACCOUNT_CURRENCY_OPTIONS = CurrencyCode.values();

function getAccountItemStyle(account: Account): JSX.CSSProperties {
	return {
		'--account-color': account.color
	};
}

function formatExchangeRateLabel(quote: ExchangeRateQuote): string {
	return `1 ${quote.fromCurrency} = ${formatCurrency(
		Number(quote.rate),
		quote.toCurrency
	)}`;
}

function toAccountDialogValue(account: PersistedAccount): AccountDialogValue {
	return {
		balance: minorUnitsToAmount(account.initialBalanceMinor),
		color: account.color,
		currency: account.currency,
		isColorAccentEnabled: account.isColorAccentEnabled,
		isIncludedInFamilyTotal: account.isIncludedInFamilyTotal,
		name: account.name,
		type: account.type
	};
}

function AccountListSkeleton() {
	return (
		<div aria-label='Загрузка счетов' class={css.accountListSkeleton} role='status'>
			<For each={[0, 1, 2, 3]}>
				{() => (
					<div class={css.accountSkeletonItem}>
						<span class={css.accountSkeletonIcon}/>
						<span class={css.accountSkeletonContent}>
							<span class={css.accountSkeletonTitle}/>
							<span class={css.accountSkeletonMeta}/>
						</span>
					</div>
				)}
			</For>
		</div>
	);
}

function AccountWorkspaceSkeleton() {
	return (
		<section aria-label='Загрузка операций' class={css.workspaceSkeleton} role='status'>
			<div class={css.workspaceSkeletonHeader}>
				<span class={css.workspaceSkeletonIcon}/>
				<span class={css.workspaceSkeletonHeading}>
					<span/>
					<span/>
				</span>
				<span class={css.workspaceSkeletonBalance}/>
			</div>
			<div class={css.workspaceSkeletonTable}>
				<span/>
				<span/>
				<span/>
				<span/>
				<span/>
			</div>
		</section>
	);
}

type AccountsEmptyStateProps = {
	onCreate: () => void;
};

function AccountsEmptyState(props: AccountsEmptyStateProps) {
	return (
		<section class={css.accountsEmpty}>
			<WalletCards aria-hidden='true' size={38} strokeWidth={1.8}/>
			<div class={css.accountsEmptyContent}>
				<h1>Счетов пока нет</h1>
				<p>Создайте первый счет, чтобы начать вести операции и считать общий баланс.</p>
			</div>
			<Button startIcon={<Plus size={18}/>} type='button' onClick={props.onCreate}>
				Создать счет
			</Button>
		</section>
	);
}

type WorkspaceLoadErrorProps = {
	onRetry: () => void;
};

function WorkspaceLoadError(props: WorkspaceLoadErrorProps) {
	return (
		<main class={css.loadErrorRoot}>
			<Container class={css.loadError}>
				<CircleAlert aria-hidden='true' size={38} strokeWidth={1.8}/>
				<div>
					<h1>Не удалось загрузить данные</h1>
					<p>
						Проверьте подключение и принадлежность пользователя к семейному пространству.
					</p>
				</div>
				<Button
					startIcon={<RefreshCw size={18}/>}
					type='button'
					variant='secondary'
					onClick={props.onRetry}
				>
					Повторить
				</Button>
			</Container>
		</main>
	);
}

type HomeContentProps = {
	accounts: Accessor<PersistedAccount[] | undefined>;
	balances: Accessor<AccountBalance[] | undefined>;
	categoryCollection: Accessor<CategoryCollection | undefined>;
	contactCollection: Accessor<ContactCollection | undefined>;
	currentExchangeRates: Accessor<CurrentExchangeRates | undefined>;
};

function HomeContent(props: HomeContentProps) {
	const homeSearch = createRouteSearchParams(homeSearchParamsSchema);
	const [editingAccount, setEditingAccount] = createSignal<PersistedAccount>();
	const [isAccountDialogOpen, setIsAccountDialogOpen] = createSignal(false);
	const [accountDialogError, setAccountDialogError] = createSignal<string>();
	const [accountDialogFieldErrors, setAccountDialogFieldErrors]
		= createSignal<Record<string, string>>();
	const [pendingCurrencyCorrection, setPendingCurrencyCorrection]
		= createSignal<AccountDialogValue>();
	const [isSidebarOpen, setIsSidebarOpen] = createSignal(false);
	const [detailsPanelMode, setDetailsPanelMode] = createSignal<OperationDetailsPanelMode>();
	const [isDetailsPanelOpen, setIsDetailsPanelOpen] = createSignal(false);
	const [isDetailsPanelPresent, setIsDetailsPanelPresent] = createSignal(false);
	const [selectedOperation, setSelectedOperation] = createSignal<OperationWithBalance>();
	const [isDesktopDetails, setIsDesktopDetails] = createSignal(false);
	const [operationError, setOperationError] = createSignal<string>();
	const [operationFieldErrors, setOperationFieldErrors]
		= createSignal<Record<string, string>>();
	const [isTransferDialogOpen, setIsTransferDialogOpen] = createSignal(false);
	const [transferDialogMode, setTransferDialogMode]
		= createSignal<TransferDialogMode>('create');
	const [editingTransfer, setEditingTransfer] = createSignal<Transfer>();
	const [transferError, setTransferError] = createSignal<string>();
	const [transferFieldErrors, setTransferFieldErrors]
		= createSignal<Record<string, string>>();
	const runCreateAccount = useAction(createAccountAction);
	const runUpdateAccount = useAction(updateAccountAction);
	const runCreateOperation = useAction(createOperationAction);
	const runDeleteOperation = useAction(deleteOperationAction);
	const runRecalculateOperationRate = useAction(recalculateOperationRateAction);
	const runUpdateOperation = useAction(updateOperationAction);
	const runCreateTransfer = useAction(createTransferAction);
	const runUpdateTransfer = useAction(updateTransferAction);
	const runDeleteTransfer = useAction(deleteTransferAction);
	const createAccountSubmission = useSubmission(createAccountAction);
	const updateAccountSubmission = useSubmission(updateAccountAction);
	const createOperationSubmission = useSubmission(createOperationAction);
	const deleteOperationSubmission = useSubmission(deleteOperationAction);
	const recalculateOperationRateSubmission = useSubmission(
		recalculateOperationRateAction
	);
	const updateOperationSubmission = useSubmission(updateOperationAction);
	const createTransferSubmission = useSubmission(createTransferAction);
	const updateTransferSubmission = useSubmission(updateTransferAction);
	const deleteTransferSubmission = useSubmission(deleteTransferAction);

	const accountsList = () => props.accounts() ?? [];
	const categories = () => props.categoryCollection()?.items ?? [];
	const contacts = () => props.contactCollection()?.items ?? [];
	const isAccountsLoading = () => (
		props.accounts() === undefined || props.balances() === undefined
	);
	const isFamilyTotalLoading = () => (
		isAccountsLoading() || props.currentExchangeRates() === undefined
	);
	const isAccountMutationPending = () => Boolean(
		createAccountSubmission.pending || updateAccountSubmission.pending
	);
	const isOperationMutationPending = () => Boolean(
		createOperationSubmission.pending
		|| deleteOperationSubmission.pending
		|| recalculateOperationRateSubmission.pending
		|| updateOperationSubmission.pending
	);
	const isTransferMutationPending = () => Boolean(
		createTransferSubmission.pending
		|| updateTransferSubmission.pending
		|| deleteTransferSubmission.pending
	);

	const accountBalanceMinorById = createMemo(() => {
		return new Map(
			(props.balances() ?? []).map((balance) => [
				balance.accountId,
				balance.balanceMinor
			])
		);
	});

	/**
	 * Resolves the active account id from the URL, falling back to the first account.
	 */
	const activeAccountId = createMemo(() => {
		const accounts = accountsList();

		if (accounts.length === 0) {
			return undefined;
		}

		const accountFromUrl = homeSearch.params().account;

		if (
			accountFromUrl
			&& accounts.some((account) => account.id === accountFromUrl)
		) {
			return accountFromUrl;
		}

		return accounts[0]?.id;
	});

	const activeAccount = createMemo<PersistedAccount | undefined>(() => {
		const accountId = activeAccountId();

		return accountId === undefined
			? undefined
			: accountsList().find((account) => account.id === accountId);
	});

	/**
	 * Canonical period mode + start date derived from the URL.
	 */
	const periodSearch = createMemo(() => (
		resolveOperationPeriodSearchState({
			from: homeSearch.params().from,
			period: homeSearch.params().period
		})
	));

	const periodMode = (): OperationPeriodMode => periodSearch().period;
	const periodFrom = (): string => periodSearch().from;

	const familyAccounts = createMemo(() => {
		return accountsList().filter((account) => account.isIncludedInFamilyTotal);
	});

	const familyTotalCurrency = createMemo(() => {
		return props.currentExchangeRates()?.baseCurrency
			?? FALLBACK_FAMILY_TOTAL_CURRENCY;
	});

	const familyExchangeRates = createMemo(() => {
		const currentExchangeRates = props.currentExchangeRates();

		return currentExchangeRates
			? toCurrencyExchangeRates(currentExchangeRates)
			: undefined;
	});

	const familyTotal = createMemo<number | undefined>(() => {
		const exchangeRates = familyExchangeRates();

		if (exchangeRates === undefined) {
			return undefined;
		}

		try {
			return sumMoney(
				familyAccounts().map((account) => ({
					amount: minorUnitsToAmount(
						accountBalanceMinorById().get(account.id) ?? 0
					),
					currency: account.currency
				})),
				exchangeRates.baseCurrency,
				exchangeRates
			);
		}
		catch {
			return undefined;
		}
	});

	const exchangeRateLabels = createMemo(() => {
		const currentExchangeRates = props.currentExchangeRates();

		if (currentExchangeRates === undefined) {
			return [];
		}

		const quotesByCurrency = new Map(
			currentExchangeRates.quotes.map((quote) => [
				quote.fromCurrency,
				quote
			])
		);

		return ACCOUNT_CURRENCY_OPTIONS
			.filter((currency) => currency !== currentExchangeRates.baseCurrency)
			.map((currency) => {
				const quote = quotesByCurrency.get(currency);

				return quote
					? formatExchangeRateLabel(quote)
					: `1 ${currency} = курс недоступен`;
			});
	});
	const accountDialogInitialValue = createMemo(() => {
		const account = editingAccount();

		return account ? toAccountDialogValue(account) : undefined;
	});
	const detailsPanelContext = createMemo(() => {
		const account = activeAccount();
		const mode = detailsPanelMode();

		return account && mode ? { account, mode } : undefined;
	});

	createEffect(() => {
		const loadedAccounts = props.accounts();

		if (!loadedAccounts || loadedAccounts.length === 0) {
			return;
		}

		const resolvedAccountId = activeAccountId();

		if (!resolvedAccountId) {
			return;
		}

		if (homeSearch.params().account !== resolvedAccountId) {
			homeSearch.setParams({ account: resolvedAccountId }, { history: 'replace' });
		}
	});

	createEffect(() => {
		const resolved = periodSearch();
		const params = homeSearch.params();

		if (params.period !== resolved.period || params.from !== resolved.from) {
			homeSearch.setParams({
				from: resolved.from,
				period: resolved.period
			}, { history: 'replace' });
		}
	});

	onMount(() => {
		const mediaQuery = window.matchMedia(DESKTOP_DETAILS_QUERY);
		const syncDetailsMode = () => setIsDesktopDetails(mediaQuery.matches);

		syncDetailsMode();
		mediaQuery.addEventListener('change', syncDetailsMode);
		onCleanup(() => mediaQuery.removeEventListener('change', syncDetailsMode));
	});

	const handleCloseDetailsPanel = () => {
		setIsDetailsPanelOpen(false);
	};

	const handleDetailsPanelPresenceChange = (present: boolean) => {
		setIsDetailsPanelPresent(present);

		if (!present) {
			setDetailsPanelMode(undefined);
			setSelectedOperation(undefined);
		}
	};

	const handleOpenCreateAccountDialog = () => {
		setIsSidebarOpen(false);
		setEditingAccount(undefined);
		setPendingCurrencyCorrection(undefined);
		setAccountDialogError(undefined);
		setAccountDialogFieldErrors(undefined);
		setIsAccountDialogOpen(true);
	};

	const handleOpenEditAccountDialog = (account: PersistedAccount) => {
		setIsSidebarOpen(false);
		setEditingAccount(account);
		setPendingCurrencyCorrection(undefined);
		setAccountDialogError(undefined);
		setAccountDialogFieldErrors(undefined);
		setIsAccountDialogOpen(true);
	};

	const handleOpenSidebar = () => {
		handleCloseDetailsPanel();
		setIsSidebarOpen(true);
	};

	const handleCloseSidebar = () => {
		setIsSidebarOpen(false);
	};

	const handleAccountSelect = (accountId: string) => {
		homeSearch.setParams({ account: accountId }, { history: 'push' });
		setIsSidebarOpen(false);
		handleCloseDetailsPanel();
	};

	const handlePeriodModeChange = (mode: OperationPeriodMode) => {
		const resolved = resolveOperationPeriodSearchState({
			from: periodFrom(),
			period: mode
		});

		homeSearch.setParams({
			from: resolved.from,
			period: resolved.period
		}, { history: 'replace' });
	};

	const handlePeriodMove = (offset: number) => {
		const shiftedAnchor = shiftOperationPeriod(
			periodSearch().anchor,
			periodMode(),
			offset
		);
		const resolved = resolveOperationPeriodSearchState({
			from: formatLocalDateKey(shiftedAnchor),
			period: periodMode()
		});

		homeSearch.setParams({
			from: resolved.from,
			period: resolved.period
		}, { history: 'replace' });
	};

	const handleAccountDialogOpenChange = (open: boolean) => {
		if (isAccountMutationPending()) {
			return;
		}

		setIsAccountDialogOpen(open);

		if (!open) {
			setPendingCurrencyCorrection(undefined);
		}
	};

	const submitAccount = async (
		accountValue: AccountDialogValue,
		confirmCurrencyCorrection: boolean
	) => {
		const currentAccount = editingAccount();
		const editableFields = {
			color: accountValue.color,
			currency: accountValue.currency,
			description: currentAccount?.description ?? '',
			initialBalanceMinor: amountToMinorUnits(accountValue.balance),
			isColorAccentEnabled: accountValue.isColorAccentEnabled,
			isIncludedInFamilyTotal: accountValue.isIncludedInFamilyTotal,
			name: accountValue.name,
			type: accountValue.type
		};

		setAccountDialogError(undefined);
		setAccountDialogFieldErrors(undefined);

		try {
			const result = currentAccount
				? await runUpdateAccount({
					...editableFields,
					confirmCurrencyCorrection,
					id: currentAccount.id,
					version: currentAccount.version
				})
				: await runCreateAccount(editableFields);

			if (result.ok) {
				setPendingCurrencyCorrection(undefined);
				homeSearch.setParams({ account: result.account.id }, { history: 'push' });
				setIsAccountDialogOpen(false);
				return;
			}

			if (result.errorCode === 'confirmation-required') {
				setPendingCurrencyCorrection(accountValue);
				return;
			}

			setAccountDialogError(result.message);
			setAccountDialogFieldErrors(result.fieldErrors);
		}
		catch {
			setAccountDialogError(
				'Не удалось сохранить счет. Проверьте подключение и повторите попытку.'
			);
		}
	};

	const handleAccountSubmit = (
		accountValue: AccountDialogValue
	): Promise<void> => {
		return submitAccount(accountValue, false);
	};

	const handleConfirmCurrencyCorrection = (): void => {
		const accountValue = pendingCurrencyCorrection();

		if (accountValue) {
			void submitAccount(accountValue, true);
		}
	};

	const handleOperationSelect = async (operation: OperationWithBalance) => {
		if (operation.transferId) {
			setTransferError(undefined);
			setTransferFieldErrors(undefined);

			try {
				const transfer = await getTransfer({ id: operation.transferId });

				setEditingTransfer(transfer);
				setTransferDialogMode('edit');
				setIsTransferDialogOpen(true);
				handleCloseDetailsPanel();
			}
			catch {
				setOperationError(
					'Не удалось открыть перевод. Обновите данные и повторите попытку.'
				);
			}

			return;
		}

		setOperationError(undefined);
		setOperationFieldErrors(undefined);
		setSelectedOperation(operation);
		setDetailsPanelMode('edit');
		setIsDetailsPanelOpen(true);
	};

	const handleCreateOperation = () => {
		setOperationError(undefined);
		setOperationFieldErrors(undefined);
		setSelectedOperation(undefined);
		setDetailsPanelMode('create');
		setIsDetailsPanelOpen(true);
	};

	const handleOpenCreateTransferDialog = () => {
		setTransferError(undefined);
		setTransferFieldErrors(undefined);
		setEditingTransfer(undefined);
		setTransferDialogMode('create');
		setIsTransferDialogOpen(true);
	};

	const handleTransferDialogOpenChange = (open: boolean) => {
		if (isTransferMutationPending()) {
			return;
		}

		setIsTransferDialogOpen(open);

		if (!open) {
			setEditingTransfer(undefined);
			setTransferError(undefined);
			setTransferFieldErrors(undefined);
		}
	};

	const handleTransferSubmit = async (value: TransferDialogSubmitValue) => {
		const editing = editingTransfer();

		setTransferError(undefined);
		setTransferFieldErrors(undefined);

		try {
			const result = transferDialogMode() === 'edit' && editing
				? await runUpdateTransfer({
					...value,
					id: editing.id,
					version: editing.version
				})
				: await runCreateTransfer(value);

			if (result.ok) {
				handleTransferDialogOpenChange(false);
				return;
			}

			setTransferError(result.message);
			setTransferFieldErrors(result.fieldErrors);
		}
		catch {
			setTransferError(
				'Не удалось сохранить перевод. Проверьте подключение и повторите попытку.'
			);
		}
	};

	const handleTransferDelete = async () => {
		const editing = editingTransfer();

		if (!editing) {
			return;
		}

		setTransferError(undefined);

		try {
			const result = await runDeleteTransfer({
				id: editing.id,
				version: editing.version
			});

			if (result.ok) {
				handleTransferDialogOpenChange(false);
				return;
			}

			setTransferError(result.message);
		}
		catch {
			setTransferError(
				'Не удалось удалить перевод. Проверьте подключение и повторите попытку.'
			);
		}
	};

	const handleOperationSubmit = async (value: OperationDraft) => {
		const selected = selectedOperation();
		const account = activeAccount();

		if (!account) {
			return;
		}

		setOperationError(undefined);
		setOperationFieldErrors(undefined);

		try {
			const result = detailsPanelMode() === 'edit' && selected
				? await runUpdateOperation({
					...value,
					id: selected.id,
					version: selected.version
				})
				: await runCreateOperation({
					...value,
					accountId: account.id
				});

			if (result.ok) {
				handleCloseDetailsPanel();
				return;
			}

			setOperationError(result.message);
			setOperationFieldErrors(result.fieldErrors);
		}
		catch {
			setOperationError(
				'Не удалось сохранить операцию. Проверьте подключение и повторите попытку.'
			);
		}
	};

	const handleOperationDelete = async () => {
		const selected = selectedOperation();

		if (!selected) {
			return;
		}

		setOperationError(undefined);

		try {
			const result = await runDeleteOperation({
				id: selected.id,
				version: selected.version
			});

			if (result.ok) {
				handleCloseDetailsPanel();
				return;
			}

			setOperationError(result.message);
		}
		catch {
			setOperationError(
				'Не удалось удалить операцию. Проверьте подключение и повторите попытку.'
			);
		}
	};

	const handleOperationRateRecalculation = async () => {
		const selected = selectedOperation();

		if (!selected) {
			return;
		}

		setOperationError(undefined);

		try {
			const result = await runRecalculateOperationRate({
				id: selected.id,
				version: selected.version
			});

			if (result.ok) {
				setSelectedOperation({
					...selected,
					...result.operation
				});
				return;
			}

			setOperationError(result.message);
		}
		catch {
			setOperationError(
				'Не удалось пересчитать курс операции. Повторите попытку.'
			);
		}
	};

	return (
		<>
			<div
				class={cn(
					css.root,
					isDetailsPanelPresent() && isDesktopDetails() && css.detailsOpen
				)}
			>
				<button
					aria-label='Закрыть список счетов'
					class={cn(css.sidebarBackdrop, isSidebarOpen() && css.sidebarBackdropVisible)}
					type='button'
					onClick={handleCloseSidebar}
				/>
				<aside
					aria-label='Счета'
					class={cn(css.sidebar, isSidebarOpen() && css.sidebarOpen)}
					id='home-accounts-sidebar'
				>
					<Container class={css.sidebarContainer}>
						<div class={css.currentDate}>{formatDate(new Date())}</div>
						<div class={css.topAction}>
							Счета
							<Button
								aria-label='Создать счет'
								disabled={isAccountsLoading()}
								iconOnly
								type='button'
								variant='ghost'
								onClick={handleOpenCreateAccountDialog}
							>
								<Plus size={19}/>
							</Button>
						</div>
						<div class={css.accountList}>
							<Show
								fallback={(
									<Show
										fallback={(
											<div class={css.accountListEmpty}>
												Создайте первый счет кнопкой выше
											</div>
										)}
										when={accountsList().length > 0}
									>
										<For each={accountsList()}>
											{(item) => {
												const accountTypeMeta = getAccountTypeMeta(item.type);
												const balanceMinor = () => (
													accountBalanceMinorById().get(item.id) ?? 0
												);

												return (
													<div
														class={cn(
															css.accountItem,
															item.isColorAccentEnabled
															&& css.accountTinted,
															activeAccountId() === item.id
															&& css.accountActive
														)}
														style={getAccountItemStyle(item)}
													>
														<button
															aria-pressed={activeAccountId() === item.id}
															class={css.accountSelect}
															type='button'
															onClick={() => handleAccountSelect(item.id)}
															onDblClick={() => (
																handleOpenEditAccountDialog(item)
															)}
														>
															<AccountIcon accountType={item.type}/>
															<span class={css.accountName}>
																{item.name}
															</span>
															<span class={css.accountBody}>
																<span class={css.accountMeta}>
																	<span>
																		{accountTypeMeta.label}
																	</span>
																	<span>
																		{item.description
																			|| 'Без группы'}
																	</span>
																</span>
																<span
																	class={cn(
																		css.accountSum,
																		balanceMinor() < 0
																		&& css.accountSumNegative
																	)}
																>
																	{formatCurrency(
																		minorUnitsToAmount(
																			balanceMinor()
																		),
																		item.currency
																	)}
																</span>
															</span>
														</button>
														<Button
															aria-label={`Редактировать счет ${item.name}`}
															class={css.accountEditButton}
															iconOnly
															size='sm'
															title='Редактировать счет'
															type='button'
															variant='ghost'
															onClick={() => (
																handleOpenEditAccountDialog(item)
															)}
														>
															<Pencil size={15}/>
														</Button>
													</div>
												);
											}}
										</For>
									</Show>
								)}
								when={isAccountsLoading()}
							>
								<AccountListSkeleton/>
							</Show>
						</div>
						<div class={css.sidebarFooter}>
							<div class={css.footerTitle}>Всего по семье</div>
							<div class={css.footerSum}>
								<Show
									fallback={(
										<Show
											fallback='Курс недоступен'
											when={familyTotal() !== undefined}
										>
											{formatCurrency(
												familyTotal() ?? 0,
												familyTotalCurrency()
											)}
										</Show>
									)}
									when={isFamilyTotalLoading()}
								>
									<span class={css.footerSkeleton}/>
								</Show>
							</div>
							<div class={css.footerMeta}>
								<Show
									fallback={`Учитывается счетов: ${familyAccounts().length}`}
									when={isAccountsLoading()}
								>
									<span class={css.footerMetaSkeleton}/>
								</Show>
							</div>
							<div class={css.exchangeRates}>
								<Show when={props.currentExchangeRates()}>
									<For each={exchangeRateLabels()}>
										{(label) => <span>{label}</span>}
									</For>
								</Show>
							</div>
						</div>
					</Container>
				</aside>

				<main class={css.main}>
					<Container class={css.mainContainer}>
						<div class={css.mainToolbar}>
							<Button
								aria-controls='home-accounts-sidebar'
								aria-expanded={isSidebarOpen()}
								type='button'
								variant='secondary'
								onClick={handleOpenSidebar}
							>
								Счета
							</Button>
						</div>
						<Show
							fallback={(
								<Show
									keyed
									fallback={(
										<AccountsEmptyState
											onCreate={handleOpenCreateAccountDialog}
										/>
									)}
									when={activeAccount()}
								>
									{(account) => {
										const accountTypeMeta = getAccountTypeMeta(account.type);
										const balanceMinor = () => (
											accountBalanceMinorById().get(account.id) ?? 0
										);

										return (
											<section class={css.accountWorkspace}>
												<header class={css.accountHeader}>
													<div class={css.accountHeading}>
														<AccountIcon
															accountType={account.type}
															class={css.previewAccountIcon}
															style={getAccountItemStyle(account)}
														/>
														<div>
															<div class={css.previewKicker}>
																{accountTypeMeta.label}
															</div>
															<h1 class={css.previewTitle}>
																{account.name}
															</h1>
														</div>
													</div>
													<div class={css.accountHeaderBalance}>
														<span>Баланс</span>
														<strong>
															{formatCurrency(
																minorUnitsToAmount(
																	balanceMinor()
																),
																account.currency
															)}
														</strong>
													</div>
												</header>

												<OperationsTable
													account={account}
													categories={categories()}
													periodFrom={periodFrom()}
													periodMode={periodMode()}
													selectedOperationId={
														selectedOperation()?.id
													}
													onCreateOperation={
														handleCreateOperation
													}
													onCreateTransfer={
														handleOpenCreateTransferDialog
													}
													onOperationSelect={
														handleOperationSelect
													}
													onPeriodModeChange={
														handlePeriodModeChange
													}
													onPeriodMove={handlePeriodMove}
												/>
											</section>
										);
									}}
								</Show>
							)}
							when={isAccountsLoading()}
						>
							<AccountWorkspaceSkeleton/>
						</Show>
					</Container>
				</main>

				<Show keyed when={detailsPanelContext()}>
					{(context) => (
						<OperationDetailsPanel
							account={context.account}
							categories={categories()}
							contacts={contacts()}
							error={operationError()}
							fieldErrors={operationFieldErrors()}
							loading={isOperationMutationPending()}
							mobile={!isDesktopDetails()}
							mode={context.mode}
							open={isDetailsPanelOpen()}
							operation={selectedOperation()}
							onDelete={handleOperationDelete}
							onOpenChange={setIsDetailsPanelOpen}
							onPresenceChange={handleDetailsPanelPresenceChange}
							onRecalculateRate={
								handleOperationRateRecalculation
							}
							onSubmit={handleOperationSubmit}
						/>
					)}
				</Show>
			</div>

			<AccountDialog
				error={accountDialogError()}
				fieldErrors={accountDialogFieldErrors()}
				initialValue={accountDialogInitialValue()}
				loading={isAccountMutationPending()}
				mode={editingAccount() ? 'edit' : 'create'}
				open={isAccountDialogOpen()}
				onOpenChange={handleAccountDialogOpenChange}
				onSubmit={handleAccountSubmit}
			/>

			<TransferDialog
				accounts={accountsList().filter((account) => account.archivedAt === null)}
				contacts={contacts()}
				error={transferError()}
				fieldErrors={transferFieldErrors()}
				householdBaseCurrency={familyTotalCurrency()}
				loading={isTransferMutationPending()}
				mode={transferDialogMode()}
				open={isTransferDialogOpen()}
				transfer={editingTransfer()}
				onDelete={handleTransferDelete}
				onOpenChange={handleTransferDialogOpenChange}
				onSubmit={handleTransferSubmit}
			/>

			<Dialog.Root
				open={pendingCurrencyCorrection() !== undefined}
				onOpenChange={(open) => {
					if (!open && !isAccountMutationPending()) {
						setPendingCurrencyCorrection(undefined);
					}
				}}
			>
				<Dialog.Content>
					<Dialog.Header closeLabel='Закрыть подтверждение смены валюты'>
						<Dialog.Title>Изменить валюту счета?</Dialog.Title>
						<Dialog.Description>
							Суммы операций останутся прежними, но будут считаться
							указанными в новой валюте.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body>
						Исторические суммы в валюте семьи и снимки курсов будут
						пересчитаны по датам операций. Если для любой даты нет
						курса, изменения не сохранятся.
					</Dialog.Body>
					<Dialog.Footer>
						<Dialog.Action closeOnClick intent='cancel'>
							Отмена
						</Dialog.Action>
						<Button
							loading={isAccountMutationPending()}
							type='button'
							onClick={handleConfirmCurrencyCorrection}
						>
							Пересчитать и сохранить
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		</>
	);
}

export function HomePage() {
	const accounts = createAsync(() => getAccounts());
	const balances = createAsync(() => getAccountBalances());
	const categoryCollection = createAsync(() => getCategories({
		status: 'active'
	}));
	const contactCollection = createAsync(() => getContacts({
		status: 'all'
	}));
	const currentExchangeRates = createAsync(() => getCurrentExchangeRates());

	return (
		<>
			<Title>Операции — iFinances</Title>
			<ErrorBoundary
				fallback={(_error, reset) => (
					<WorkspaceLoadError
						onRetry={() => {
							void Promise.all([
								revalidate(getAccounts.key, true),
								revalidate(getAccountBalances.key, true),
								revalidate(getCategories.key, true),
								revalidate(getContacts.key, true),
								revalidate(getCurrentExchangeRates.key, true)
							]).then(reset, reset);
						}}
					/>
				)}
			>
				<HomeContent
					accounts={accounts}
					balances={balances}
					categoryCollection={categoryCollection}
					contactCollection={contactCollection}
					currentExchangeRates={currentExchangeRates}
				/>
			</ErrorBoundary>
		</>
	);
}
