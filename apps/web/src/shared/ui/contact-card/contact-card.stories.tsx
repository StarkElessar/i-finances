import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { ContactCard } from './contact-card';

const meta = {
	title: 'Kit/ContactCard',
	component: ContactCard,
	args: { name: 'Маркет Север', kind: 'company', spentMinor: 18420, currency: 'BYN', onEdit: () => undefined }
} satisfies Meta<typeof ContactCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Person: Story = {
	args: { name: 'Алексей', kind: 'person', phone: '+375 29 000-00-00', spentMinor: 0 }
};

export const WithoutEdit: Story = { args: { onEdit: undefined } };

export const EditHover: Story = { parameters: { pseudo: { hover: ['button'] } } };

export const EditFocus: Story = { parameters: { pseudo: { focusVisible: ['button'] } } };
