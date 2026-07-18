const mockIcons = [
    'wallet',
    'receipt',
    'chart-line',
    'calendar',
    'credit-card',
    'landmark'
] as const;

/**
 * Row model used by the declarative grid example.
 */
export type TableResizeMockRow = {
    id: number;
    name: string;
    description: string;
    count: number;
    icon: (typeof mockIcons)[number];
    link: string;
};

/**
 * Compact labels displayed by the icon cell template.
 */
export const iconLabels: Record<TableResizeMockRow['icon'], string> = {
    wallet: 'WA',
    receipt: 'RC',
    'chart-line': 'CH',
    calendar: 'CA',
    'credit-card': 'CC',
    landmark: 'LA'
};

/**
 * Mock finance rows used to demonstrate grid behavior.
 */
export const tableResizeMockRows: TableResizeMockRow[] = Array.from({ length: 60 }, (_, index) => {
    const id = index + 1;
    const icon = mockIcons[index % mockIcons.length];

    return {
        id,
        name: `Finance item ${id}`,
        description: `Mock table row ${id} for resize testing`,
        count: 12 + (index * 7) % 89,
        icon,
        link: `/table-resize/${id}`
    };
});
