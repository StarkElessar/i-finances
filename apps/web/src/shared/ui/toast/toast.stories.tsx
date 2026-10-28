import { StoryStack } from '@/shared/storybook';
import { Button } from '@/shared/ui/button';
import { Fab } from '@/shared/ui/fab';

import { Plus } from 'lucide-solid';
import { For } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { createToaster, type ToastOptions } from './create-toaster';
import { Toast } from './toast';
import { ToastContainer } from './toast-container';

function Examples(props: { options: ToastOptions[] }) {
	const toaster = createToaster();
	props.options.forEach((options) => toaster.show({ ...options, duration: 0 }));

	return <StoryStack column><For each={toaster.toasts()}>{(toast) => <Toast toast={toast} toaster={toaster}/>}</For></StoryStack>;
}

function Placement() {
	const toaster = createToaster();
	const notify = () => toaster.show({ message: 'Операция добавлена' });

	return (
		<StoryStack>
			<Button onClick={notify}>Добавить уведомление · 4 с</Button>
			<Button variant='secondary' onClick={() => toaster.show({ message: 'Не удалось сохранить', tone: 'error' })}>
				Ошибка · до закрытия
			</Button>
			<Button
				variant='secondary'
				onClick={() => toaster.show({
					message: 'Операция добавлена',
					tone: 'success',
					action: { label: 'Отменить', onClick: () => undefined }
				})}
			>
				С действием · 8 с
			</Button>
			<Fab aria-label='Новая операция' onClick={notify}><Plus/></Fab>
			<ToastContainer toaster={toaster}/>
		</StoryStack>
	);
}

const meta = {
	title: 'Kit/Toast',
	component: Examples,
	args: { options: [{ message: 'Чек обработан, создано 4 операции' }] },
	render: (args) => <Examples {...args}/>
} satisfies Meta<typeof Examples>;

export default meta;

type Story = StoryObj<typeof meta>;

// Static samples remain visible for inspection; PlacementAndTimers uses the actual board durations.
export const Default: Story = {};

export const Success: Story = { render: () => <Examples options={[{ message: 'Операция добавлена', tone: 'success' }]}/> };

export const Warning: Story = { render: () => <Examples options={[{ message: 'Проверьте данные перед сохранением', tone: 'warning' }]}/> };

export const Error: Story = { render: () => <Examples options={[{ message: 'Не удалось сохранить', tone: 'error' }]}/> };

export const WithAction: Story = {
	render: () => (
		<Examples options={[{ message: 'Операция добавлена', tone: 'success', action: { label: 'Отменить', onClick: () => undefined } }]}/>
	)
};

export const Retry: Story = {
	render: () => (
		<Examples options={[{ message: 'Не удалось сохранить', tone: 'error', action: { label: 'Повторить', onClick: () => undefined } }]}/>
	)
};

export const Stack: Story = {
	render: () => (
		<Examples
			options={[
				{ message: 'Операция добавлена', tone: 'success' },
				{ message: 'Чек обработан, создано 4 операции' },
				{ message: 'Не удалось сохранить', tone: 'error' }
			]}
		/>
	)
};

export const Hover: Story = { parameters: { pseudo: { hover: ['button'] } } };

export const Focus: Story = { parameters: { pseudo: { focusVisible: ['button'] } } };

export const Touch: Story = {
	render: () => <StoryStack touch><Examples options={[{ message: 'Операция добавлена', tone: 'success' }]}/></StoryStack>
};

export const PlacementAndTimers: Story = { render: () => <Placement/> };
