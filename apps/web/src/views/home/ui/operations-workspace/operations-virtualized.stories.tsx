import css from './operations-workspace.module.scss';

import { StoryStack } from '@/shared/storybook';
import { Button } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/text-field';

import type { OperationSort } from '@/entities/operation';
import { createOperationGroups } from '@/entities/operation';

import { createMemo, createSignal, Show } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { createOperationVirtualItems } from '../../model/operation-virtual-items';
import { OperationsList } from '../operations-list/operations-list';
import { OperationsTable } from '../operations-table/operations-table';

import { createVirtualizedOperations, VIRTUALIZED_ACCOUNT } from './operations-virtualized.fixture';

const OPERATIONS = createVirtualizedOperations(5000);

type VirtualizedStoryProps = {
	highlightOperationId: string;
	mode: 'table' | 'list';
	selectedOperationId: string;
};

function OperationsVirtualizedStory(props: VirtualizedStoryProps) {
	const [selectedId, setSelectedId] = createSignal('');
	const [highlightId, setHighlightId] = createSignal('');
	const [query, setQuery] = createSignal('');
	const [sort, setSort] = createSignal<OperationSort>({ field: 'date', direction: 'desc' });
	const [inserted, setInserted] = createSignal(false);
	const operations = createMemo(() => inserted()
		? [...OPERATIONS, { ...OPERATIONS[0], id: 'inserted-operation', title: 'Новая операция' }]
		: OPERATIONS);
	const groups = createMemo(() => createOperationGroups(
		operations().filter((operation) => operation.title.toLocaleLowerCase('ru-BY').includes(query().toLocaleLowerCase('ru-BY'))),
		operations(),
		sort()
	));
	const rows = createMemo(() => createOperationVirtualItems(groups()));
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
		onOperationSelect: (operation: { id: string }) => setSelectedId(operation.id),
		onSortFieldChange: (field: string) => setSort({ field: field as OperationSort['field'], direction: 'asc' })
	});

	return (
		<StoryStack column viewport>
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
		</StoryStack>
	);
}

const meta = {
	title: 'Home/OperationsVirtualized',
	component: OperationsVirtualizedStory,
	args: { highlightOperationId: '', mode: 'table', selectedOperationId: '' },
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof OperationsVirtualizedStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Table: Story = {};

export const List: Story = { args: { mode: 'list' } };
