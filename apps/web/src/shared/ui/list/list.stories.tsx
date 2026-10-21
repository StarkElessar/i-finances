import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import { Check, LogOut, Monitor, Send, Smartphone, Trash } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { List } from './list';
import { ListRow } from './list-row';

const meta = {
	title: 'Kit/List',
	component: List,
	args: {
		'aria-label': 'Ключи доступа',
		// Every story renders its own rows.
		children: null
	}
} satisfies Meta<typeof List>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Passkeys: the device, the dates and a quiet delete action on the right. */
export const Passkeys: Story = {
	render: (args) => (
		<List {...args}>
			<ListRow
				icon={<Smartphone/>}
				meta='Создан 12 сентября 2026 · использован сегодня'
				title='iPhone 15 · Safari'
				trailing={<Button aria-label='Удалить ключ доступа' iconOnly size='sm' variant='danger-ghost'><Trash/></Button>}
			/>
			<ListRow
				icon={<Monitor/>}
				meta='Создан 3 марта 2026 · использован 2 октября'
				tint={10}
				title='MacBook · Chrome'
				trailing={<Button aria-label='Удалить ключ доступа' iconOnly size='sm' variant='danger-ghost'><Trash/></Button>}
			/>
		</List>
	)
};

/** Sessions: the current one carries a badge and no button, the others can be ended. */
export const Sessions: Story = {
	args: { 'aria-label': 'Активные сеансы' },
	render: (args) => (
		<List {...args}>
			<ListRow
				icon={<Smartphone/>}
				meta='Сегодня · IP ≈ 203.0.113.24'
				title={<>Safari · iOS <Badge tone='info'>Этот сеанс</Badge></>}
			/>
			<ListRow
				icon={<Monitor/>}
				meta='17 октября · IP ≈ 203.0.113.58'
				tint={10}
				title='Chrome · macOS'
				trailing={<Button size='sm' variant='secondary'>Завершить</Button>}
			/>
		</List>
	)
};

/** A linked account with a status badge. */
export const LinkedAccount: Story = {
	args: { 'aria-label': 'Telegram' },
	render: (args) => (
		<List {...args}>
			<ListRow
				icon={<Send/>}
				meta='@alexey'
				title='Telegram'
				trailing={<Badge icon={<Check/>} tone='success'>Привязан</Badge>}
			/>
		</List>
	)
};

export const LongText: Story = {
	render: (args) => (
		<List {...args}>
			<ListRow
				icon={<LogOut/>}
				meta='Создан 12 сентября 2026 · использован сегодня · очень длинное описание, которое переносится на вторую строку'
				title='Очень длинное название устройства, которое не должно обрезаться, а переносится'
			/>
		</List>
	)
};
