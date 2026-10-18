import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { PeriodNavigator } from './period-navigator';

const MONTHS = ['Август 2026', 'Сентябрь 2026', 'Октябрь 2026'];

const meta = {
	title: 'Kit/PeriodNavigator',
	component: PeriodNavigator,
	args: {
		label: 'Октябрь 2026',
		previousLabel: 'Предыдущий месяц',
		nextLabel: 'Следующий месяц',
		onPrevious: () => undefined,
		onNext: () => undefined
	}
} satisfies Meta<typeof PeriodNavigator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Steps through three months; the forward button is disabled on the last one (the current month). */
export const Interactive: Story = {
	render: (args) => {
		const [index, setIndex] = createSignal(MONTHS.length - 1);

		return (
			<PeriodNavigator
				{...args}
				canMoveNext={index() < MONTHS.length - 1}
				label={MONTHS[index()]}
				onNext={() => setIndex((value) => Math.min(value + 1, MONTHS.length - 1))}
				onPrevious={() => setIndex((value) => Math.max(value - 1, 0))}
			/>
		);
	}
};

export const LastPeriod: Story = {
	args: { canMoveNext: false }
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true } }
};

export const WeekRange: Story = {
	args: {
		label: '12 окт. — 18 окт. 2026',
		previousLabel: 'Предыдущий период',
		nextLabel: 'Следующий период'
	}
};
