import css from './table-resize.module.scss';

import type { TableResizeMockRow } from './model';
import { iconLabels, tableResizeMockRows } from './model';

import type { GridColumn } from '~/shared/ui';
import { Container, Grid } from '~/shared/ui';

const columns: GridColumn<TableResizeMockRow>[] = [
    {
        id: 'id',
        header: 'Id',
        width: 60,
        accessor: (row) => row.id
    },
    {
        id: 'name',
        header: 'Name',
        width: 160,
        accessor: (row) => row.name
    },
    {
        id: 'description',
        header: 'Description',
        width: 210,
        accessor: (row) => row.description
    },
    {
        id: 'count',
        header: 'Count',
        width: 100,
        accessor: (row) => row.count
    },
    {
        id: 'icon',
        header: 'Icon',
        width: 100,
        accessor: (row) => row.icon,
        clientTemplate: ({ dataItem }) => (
            <span class={css.iconBadge} title={dataItem.icon}>
                {iconLabels[dataItem.icon]}
            </span>
        )
    },
    {
        id: 'link',
        header: 'Link',
        width: 160,
        accessor: (row) => row.link,
        clientTemplate: ({ dataItem }) => (
            <a class={css.rowLink} href={dataItem.link}>
                Open
            </a>
        )
    }
];

/**
 * Demonstrates declarative grid configuration with mock finance data.
 */
export function TableResizePage() {
    return (
        <Container class={css.page}>
            <div class={css.header}>
                <div>
                    <h1 class={css.title}>Table resize</h1>
                    <p class={css.subtitle}>{tableResizeMockRows.length} finance rows</p>
                </div>
                <span class={css.status}>Mock dataset</span>
            </div>

            <Grid columns={columns} data={tableResizeMockRows}/>
        </Container>
    );
}
