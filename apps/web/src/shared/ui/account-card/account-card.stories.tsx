import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { AccountCard, type AccountCardProps } from './account-card';

function Controlled(props: AccountCardProps) {
	const [selected, setSelected] = createSignal(Boolean(props.selected));

	return <AccountCard {...props} selected={selected()} onSelect={() => setSelected(true)}/>;
}

const meta = {
	title: 'Kit/AccountCard',
	component: AccountCard,
	args: {
		name: 'БСБ Виртуальная карта', type: 'card', balanceMinor: 94524, currency: 'USD',
		tint: 'var(--color-series-5)', holder: 'Сергей', cardLast4: '5678', onSelect: () => undefined
	},
	render: (args) => <Controlled {...args}/>
} satisfies Meta<typeof AccountCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const Expired: Story = {
	args: {
		name: 'Карта жены', balanceMinor: 34050, currency: 'BYN', tint: 'var(--color-series-3)',
		holder: 'Жена', cardLast4: '0042', expired: true
	}
};

export const Cash: Story = {
	args: { name: 'Кошелёк', type: 'cash', balanceMinor: 12000, currency: 'BYN', tint: 'var(--color-series-8)', holder: undefined }
};

export const LongText: Story = {
	args: {
		name: 'Основная семейная карта для повседневных расходов и накоплений',
		holder: 'Александр Александрович Константинопольский'
	},
	globals: { viewport: { value: 'phone', isRotated: false } }
};

export const Focus: Story = { parameters: { pseudo: { focusVisible: ['button'] } } };

export const SelectedFocus: Story = { args: { selected: true }, parameters: { pseudo: { focusVisible: ['button'] } } };
