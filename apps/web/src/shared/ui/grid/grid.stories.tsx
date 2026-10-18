import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Grid } from './grid';
import type { GridColumn, GridProps, GridSortState } from './types';

type OperationRow = {
	id: string;
	date: string;
	title: string;
	category: string;
	amount: string;
};

const ROWS: readonly OperationRow[] = [
	{ id: '1', date: '2026-10-18', title: 'Кофе', category: 'Кафе', amount: '−4,50' },
	{ id: '2', date: '2026-10-17', title: 'Такси домой', category: 'Транспорт', amount: '−18,00' },
	{ id: '3', date: '2026-10-15', title: 'Зарплата', category: 'Доход', amount: '+2 400,00' },
	{ id: '4', date: '2026-10-14', title: 'Продукты', category: 'Продукты', amount: '−62,30' }
];

const COLUMNS: readonly GridColumn<OperationRow>[] = [
	{ id: 'date', header: 'Дата', accessor: (row) => row.date, sortable: true, width: 120 },
	{ id: 'title', header: 'Название', accessor: (row) => row.title, sortable: true, width: 220 },
	{ id: 'category', header: 'Категория', accessor: (row) => row.category, width: 160 },
	{ id: 'amount', header: 'Сумма', accessor: (row) => row.amount, width: 120 }
];

// Sorting and selection are controlled by the parent, so the story keeps them in signals.
function renderGrid(args: GridProps<OperationRow>) {
	const [sort, setSort] = createSignal<GridSortState | undefined>(args.sort);
	const [selectedId, setSelectedId] = createSignal<string | undefined>();

	return (
		<Grid
			{...args}
			isRowSelected={(row) => row.id === selectedId()}
			sort={sort()}
			onRowClick={(row) => setSelectedId(row.id)}
			onSortChange={(columnId) => setSort((current) => ({
				columnId,
				direction: current?.columnId === columnId && current.direction === 'asc' ? 'desc' : 'asc'
			}))}
		/>
	);
}

const meta = {
	title: 'Kit/Grid',
	args: {
		'aria-label': 'Операции',
		columns: COLUMNS,
		data: ROWS,
		getRowKey: (row) => row.id
	},
	render: renderGrid
} satisfies Meta<GridProps<OperationRow>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sorted: Story = {
	args: { sort: { columnId: 'date', direction: 'desc' } }
};

export const Empty: Story = {
	args: { data: [], emptyContent: 'Операций за период нет' }
};

export const FullWidthRow: Story = {
	args: {
		isFullWidthRow: (row) => row.id === '3',
		fullWidthRowTemplate: (context) => <strong>{context.dataItem.title}: поступления за месяц</strong>
	}
};
