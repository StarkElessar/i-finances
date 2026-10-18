import { StoryStack } from '@/shared/storybook';

import { Archive, Trash } from 'lucide-solid';
import { createSignal, For } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { DragActionTone } from './drag-action';
import { createDragAction, DragAction } from './drag-action';

const ROWS = [
	{ id: 'coffee', title: 'Кофе', description: '4,50' },
	{ id: 'taxi', title: 'Такси', description: '18,00' },
	{ id: 'books', title: 'Книги', description: '32,90' }
] as const;

type DragActionStoryArgs = {
	label: string;
	tone: DragActionTone;
};

// Drag a row (pointer down, move past the threshold) to reveal the drop zone; dropping on it removes the row.
function renderDemo(args: DragActionStoryArgs) {
	const [rows, setRows] = createSignal<readonly (typeof ROWS)[number][]>(ROWS);
	const controller = createDragAction({
		onDrop: (id) => setRows((current) => current.filter((row) => row.id !== id))
	});
	const Icon = () => (args.tone === 'danger' ? <Trash size={20}/> : <Archive size={20}/>);

	return (
		<>
			<StoryStack column>
				<For each={rows()}>
					{(row) => (
						<div
							onPointerCancel={controller.onPointerCancel}
							onPointerDown={(event) => controller.onPointerDown(row.id, event)}
							onPointerMove={controller.onPointerMove}
							onPointerUp={controller.onPointerUp}
						>
							<DragAction.Preview description={row.description} icon={<Archive size={16}/>} title={row.title}/>
						</div>
					)}
				</For>
			</StoryStack>
			<DragAction.Overlay controller={controller} icon={<Icon/>} label={args.label} tone={args.tone}>
				{(activeId) => (
					<DragAction.Preview
						description='Отпустите над зоной'
						icon={<Archive size={16}/>}
						title={ROWS.find((row) => row.id === activeId)?.title ?? ''}
					/>
				)}
			</DragAction.Overlay>
		</>
	);
}

// DragAction is a controller plus a namespace of parts, so the story is typed by its own controls.
const meta = {
	title: 'Kit/DragAction',
	args: {
		label: 'Удалить',
		tone: 'danger'
	},
	argTypes: {
		tone: { control: 'inline-radio', options: ['danger', 'neutral'] }
	},
	render: renderDemo
} satisfies Meta<DragActionStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Danger: Story = {};

export const Neutral: Story = {
	args: { label: 'В архив', tone: 'neutral' }
};

export const PreviewOnly: Story = {
	render: () => (
		<DragAction.Preview accentColor='var(--color-primary)' description='18,00' icon={<Archive size={16}/>} title='Такси'/>
	)
};
