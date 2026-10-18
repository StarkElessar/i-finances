import { createSignal } from 'solid-js';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { ComboboxProps } from './combobox';
import { Combobox } from './combobox';

type CategoryOption = {
	id: string;
	name: string;
	disabled?: boolean;
};

const CATEGORIES: readonly CategoryOption[] = [
	{ id: 'groceries', name: 'Продукты' },
	{ id: 'transport', name: 'Транспорт' },
	{ id: 'health', name: 'Здоровье' },
	{ id: 'leisure', name: 'Развлечения' },
	{ id: 'archive', name: 'Архивная категория', disabled: true }
];

type CategoryComboboxProps = ComboboxProps<CategoryOption>;

// The combobox is controlled, so every story keeps the selected id in a local signal.
function renderControlled(args: CategoryComboboxProps) {
	const [value, setValue] = createSignal(args.value);

	return <Combobox {...args} value={value()} onChange={setValue}/>;
}

const meta = {
	title: 'Kit/Combobox',
	args: {
		label: 'Категория',
		options: CATEGORIES,
		value: null,
		onChange: fn(),
		placeholder: 'Выберите категорию',
		searchPlaceholder: 'Найти категорию',
		getOptionLabel: (option) => option.name,
		getOptionValue: (option) => option.id,
		getOptionDisabled: (option) => option.disabled === true
	},
	render: renderControlled
} satisfies Meta<CategoryComboboxProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
	args: { value: 'transport' }
};

export const Open: Story = {
	play: async ({ canvasElement }) => {
		canvasElement.querySelector<HTMLButtonElement>('[role="combobox"]')?.click();
	}
};

export const Optional: Story = {
	args: { optional: true, hint: 'Можно оставить пустым' }
};

export const Empty: Story = {
	args: { options: [], emptyText: 'Категорий пока нет' }
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true, focusWithin: true } }
};

export const WithError: Story = {
	args: { error: 'Выберите категорию' }
};

export const Disabled: Story = {
	args: { disabled: true, value: 'groceries' }
};
