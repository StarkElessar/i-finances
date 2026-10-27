import { Heart, ShoppingCart, Utensils, Wrench } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { CategoryCard } from './category-card';

const meta = {
	title: 'Kit/CategoryCard',
	component: CategoryCard,
	args: {
		name: 'Здоровье', spentMinor: 8600, budgetMinor: 14000, currency: 'BYN',
		tint: 'var(--color-series-5)', icon: null, onEdit: () => undefined
	},
	render: (args) => <CategoryCard {...args} icon={<Heart/>}/>
} satisfies Meta<typeof CategoryCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Warning: Story = {
	args: { name: 'Продукты', spentMinor: 25460, budgetMinor: 28000, budgetTone: 'warning', tint: 'var(--color-series-1)' },
	render: (args) => <CategoryCard {...args} icon={<ShoppingCart/>}/>
};

export const OverBudget: Story = {
	args: { name: 'Фастфуд', spentMinor: 23300, budgetMinor: 20000, tint: 'var(--color-series-2)' },
	render: (args) => <CategoryCard {...args} icon={<Utensils/>}/>
};

export const NoBudget: Story = {
	args: { name: 'Ремонт', spentMinor: 18100, budgetMinor: null, tint: 'var(--color-series-9)' },
	render: (args) => <CategoryCard {...args} icon={<Wrench/>}/>
};

export const WithoutEdit: Story = { args: { onEdit: undefined } };

export const EditHover: Story = { parameters: { pseudo: { hover: ['button'] } } };

export const EditFocus: Story = { parameters: { pseudo: { focusVisible: ['button'] } } };
