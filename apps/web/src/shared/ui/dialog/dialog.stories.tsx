import { Button } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/text-field';

import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Dialog } from './dialog';

type DialogStoryArgs = {
	danger: boolean;
	defaultOpen: boolean;
	closeOnBackdropClick: boolean;
	closeOnEscape: boolean;
};

function renderDialog(args: DialogStoryArgs) {
	const [open, setOpen] = createSignal(args.defaultOpen);

	return (
		<>
			<Button onClick={() => setOpen(true)}>Открыть диалог</Button>
			<Dialog.Root
				closeOnBackdropClick={args.closeOnBackdropClick}
				closeOnEscape={args.closeOnEscape}
				open={open()}
				onOpenChange={setOpen}
			>
				<Dialog.Content as='form' onSubmit={(event) => event.preventDefault()}>
					<Dialog.Header>
						<Dialog.Kicker>Счета</Dialog.Kicker>
						<Dialog.Title>{args.danger ? 'Удалить счёт?' : 'Новый счёт'}</Dialog.Title>
						<Dialog.Description>
							{args.danger ? 'Операции по счёту тоже будут удалены.' : 'Название увидите только вы и участники окружения.'}
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body>
						{args.danger ? null : <TextField label='Название' placeholder='Например, «Зарплатная карта»'/>}
					</Dialog.Body>
					<Dialog.Footer>
						<Dialog.Action closeOnClick intent='cancel'>Отмена</Dialog.Action>
						<Dialog.Action closeOnClick intent={args.danger ? 'danger' : 'confirm'}>
							{args.danger ? 'Удалить' : 'Создать'}
						</Dialog.Action>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		</>
	);
}

// Dialog is a namespace object of parts, so the story is typed by its own controls.
const meta = {
	title: 'Kit/Dialog',
	args: {
		danger: false,
		defaultOpen: true,
		closeOnBackdropClick: true,
		closeOnEscape: true
	},
	parameters: { layout: 'fullscreen' },
	render: renderDialog
} satisfies Meta<DialogStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Danger: Story = {
	args: { danger: true }
};

export const Closed: Story = {
	args: { defaultOpen: false }
};

export const Modal: Story = {
	args: { closeOnBackdropClick: false, closeOnEscape: false }
};
