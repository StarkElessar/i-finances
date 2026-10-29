import storyCss from './operations-virtualized.module.scss';
import css from './operations-workspace.module.scss';

import { StoryStack } from '@/shared/storybook';
import { Button } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/text-field';

import type { OperationSort } from '@/entities/operation';
import { createOperationGroups } from '@/entities/operation';

import { createMemo, createSignal, Show } from 'solid-js';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { createOperationVirtualItems } from '../../model/operation-virtual-items';
import { OperationDetailsPanel } from '../operation-details-panel';
import { OperationsList } from '../operations-list/operations-list';
import { OperationsTable } from '../operations-table/operations-table';

import { createVirtualizedOperations, VIRTUALIZED_ACCOUNT } from './operations-virtualized.fixture';

const OPERATIONS = createVirtualizedOperations(5000);

type VirtualizedStoryProps = {
	highlightOperationId: string;
	mode: 'table' | 'list';
	selectedOperationId: string;
	showDetailsPanel: boolean;
};

function OperationsVirtualizedStory(props: VirtualizedStoryProps) {
	const [selectedId, setSelectedId] = createSignal('');
	const [highlightId, setHighlightId] = createSignal('');
	const [query, setQuery] = createSignal('');
	const [sort, setSort] = createSignal<OperationSort>({ field: 'date', direction: 'desc' });
	const [inserted, setInserted] = createSignal(false);
	const [isPanelOpen, setIsPanelOpen] = createSignal(false);
	const operations = createMemo(() => inserted()
		? [...OPERATIONS, { ...OPERATIONS[0], id: 'inserted-operation', title: 'Новая операция' }]
		: OPERATIONS);
	const groups = createMemo(() => createOperationGroups(
		operations().filter((operation) => operation.title.toLocaleLowerCase('ru-BY').includes(query().toLocaleLowerCase('ru-BY'))),
		operations(),
		sort()
	));
	const rows = createMemo(() => createOperationVirtualItems(groups()));
	const selectedOperation = createMemo(() => props.showDetailsPanel
		? operations().find((operation) => operation.id === selectedId())
		: undefined);
	const bodyProps = () => ({
		account: VIRTUALIZED_ACCOUNT,
		emptyContent: 'По вашему запросу ничего не найдено',
		highlightOperationId: props.highlightOperationId || highlightId() || undefined,
		rows: rows(),
		resolveCategoryColor: () => 'var(--color-text-tertiary)',
		resolveCategoryIcon: () => 'circle',
		scrollResetKey: JSON.stringify([query(), sort()]),
		selectedOperationId: props.selectedOperationId || selectedId() || undefined,
		sort: sort(),
		onOperationSelect: (operation: { id: string }) => {
			setSelectedId(operation.id);
			setIsPanelOpen(true);
		},
		onSortFieldChange: (field: string) => setSort({ field: field as OperationSort['field'], direction: 'asc' })
	});

	return (
		<StoryStack viewport>
			<section class={css.root}>
				<div class={css.toolbar}>
					<TextField
						aria-label='Поиск операций'
						placeholder='Поиск'
						value={query()}
						onInput={(event) => setQuery(event.currentTarget.value)}
					/>
					<Button
						variant='secondary'
						onClick={() => setSort((current) => ({
							...current, direction: current.direction === 'desc' ? 'asc' : 'desc'
						}))}
					>Обратный порядок</Button>
					<Button
						disabled={inserted()}
						onClick={() => {
							setInserted(true);
							setHighlightId('inserted-operation');
						}}
					>Вставить операцию 1 января</Button>
				</div>
				<Show fallback={<OperationsList {...bodyProps()}/>} when={props.mode === 'table'}>
					<OperationsTable {...bodyProps()}/>
				</Show>
			</section>
			<Show when={selectedOperation()}>
				{(operation) => (
					<div class={props.mode === 'table' ? storyCss.panel : undefined}>
						<OperationDetailsPanel
							account={VIRTUALIZED_ACCOUNT}
							accountChoices={[]}
							categories={[]}
							contacts={[]}
							mobile={props.mode === 'list'}
							mode='edit'
							open={isPanelOpen()}
							operation={operation()}
							onDelete={fn()}
							onOpenChange={setIsPanelOpen}
							onPresenceChange={(present) => {
								// Match Home: clear selection before the panel restores focus after its exit animation.
								if (!present) {
									setSelectedId('');
								}
							}}
							onRecalculateRate={fn()}
							onSubmit={fn()}
						/>
					</div>
				)}
			</Show>
		</StoryStack>
	);
}

const meta = {
	title: 'Home/OperationsVirtualized',
	component: OperationsVirtualizedStory,
	args: { highlightOperationId: '', mode: 'table', selectedOperationId: '', showDetailsPanel: false },
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof OperationsVirtualizedStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Table: Story = {};

export const List: Story = { args: { mode: 'list' } };

/** Exercise both live keyboard focus and the panel's saved DOM focus anchor beyond overscan. */
async function checkFocusAfterScrolling(canvasElement: HTMLElement): Promise<void> {
	const body = within(canvasElement.ownerDocument.body);
	const table = canvasElement.querySelector('table');
	const scrollElement = table?.parentElement
		?? within(canvasElement).getByRole('region', { name: `Операции счёта «${VIRTUALIZED_ACCOUNT.name}»` });

	await waitFor(() => expect(canvasElement.querySelector('[data-row-key^="operation:"]')).toBeTruthy());

	const origin = canvasElement.querySelector<HTMLElement>('[data-row-key^="operation:"]');

	if (!origin) {
		throw new Error('The virtualized operation and its scroll owner must be mounted');
	}

	const focusTarget = origin.querySelector<HTMLButtonElement>('button') ?? origin;
	const rowCount = Number(table?.getAttribute('aria-rowcount') ?? origin.getAttribute('aria-setsize'));
	const lastRowIndex = rowCount - (table ? 2 : 1);
	const scrollPastOverscan = async () => {
		scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: 'instant' });
		await waitFor(() => expect(canvasElement.querySelector(`[data-index="${lastRowIndex}"]`)).toBeTruthy());
		expect(origin.isConnected).toBe(true);
		expect(origin.getBoundingClientRect().bottom).toBeLessThan(scrollElement.getBoundingClientRect().top);
	};

	focusTarget.focus();
	await scrollPastOverscan();
	expect(focusTarget).toHaveFocus();
	scrollElement.scrollTo({ top: 0, behavior: 'instant' });
	await waitFor(() => expect(origin.getBoundingClientRect().top).toBeGreaterThanOrEqual(scrollElement.getBoundingClientRect().top));

	// Open from a visible row, scroll it beyond overscan again, then close the real details panel.
	await userEvent.keyboard('{Enter}');
	await body.findByRole('button', { name: 'Закрыть панель' });
	await waitFor(() => expect(focusTarget).not.toHaveFocus());
	await scrollPastOverscan();
	await userEvent.click(body.getByRole('button', { name: 'Закрыть панель' }));
	await waitFor(() => expect(body.queryByRole('button', { name: 'Закрыть панель' })).toBeNull());
	await waitFor(() => expect(focusTarget).toHaveFocus());
}

export const TableFocusRestored: Story = {
	args: { showDetailsPanel: true },
	play: async ({ canvasElement }) => checkFocusAfterScrolling(canvasElement)
};

export const ListFocusRestored: Story = {
	args: { mode: 'list', showDetailsPanel: true },
	play: async ({ canvasElement }) => checkFocusAfterScrolling(canvasElement)
};
