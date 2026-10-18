import { Copy, Pencil, Trash } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { ContextMenu } from './context-menu';

type MenuStoryArgs = {
	align: 'start' | 'end';
	defaultOpen: boolean;
	triggerMode: 'click' | 'contextmenu' | 'both';
};

function renderMenu(args: MenuStoryArgs) {
	return (
		<ContextMenu.Root defaultOpen={args.defaultOpen} triggerMode={args.triggerMode}>
			<ContextMenu.Trigger>Действия</ContextMenu.Trigger>
			<ContextMenu.Content align={args.align}>
				<ContextMenu.Label>Операция</ContextMenu.Label>
				<ContextMenu.Item><Pencil size={16}/> Изменить</ContextMenu.Item>
				<ContextMenu.Item><Copy size={16}/> Дублировать</ContextMenu.Item>
				<ContextMenu.Item disabled>Переместить</ContextMenu.Item>
				<ContextMenu.Separator/>
				<ContextMenu.Item variant='danger'><Trash size={16}/> Удалить</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Root>
	);
}

// ContextMenu is a namespace object of parts, so the story is typed by its own controls.
const meta = {
	title: 'Kit/ContextMenu',
	args: {
		align: 'start',
		defaultOpen: false,
		triggerMode: 'click'
	},
	argTypes: {
		align: { control: 'inline-radio', options: ['start', 'end'] },
		triggerMode: { control: 'inline-radio', options: ['click', 'contextmenu', 'both'] }
	},
	render: renderMenu
} satisfies Meta<MenuStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Open: Story = {
	args: { defaultOpen: true },
	parameters: { layout: 'fullscreen' }
};

export const AlignEnd: Story = {
	args: { align: 'end', defaultOpen: true },
	parameters: { layout: 'fullscreen' }
};

export const RightClick: Story = {
	args: { triggerMode: 'contextmenu' }
};
