import { Plus } from 'lucide-solid';
import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { ChoiceCard } from './choice-card';
import { ChoiceCardGroup } from './choice-card-group';

// The icon (a JSX node) is created in `render`, not in module-level `args`.
const meta = {
	title: 'Kit/ChoiceCard',
	component: ChoiceCard,
	args: {
		checked: false,
		description: 'Для вас и семьи, приглашения потом',
		icon: null,
		name: 'story-choice',
		onChange: () => undefined,
		title: 'Создать своё окружение',
		value: 'create'
	},
	render: (args) => <ChoiceCard {...args} icon={<Plus/>}/>
} satisfies Meta<typeof ChoiceCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
	args: { checked: true }
};

export const Disabled: Story = {
	args: { disabled: true }
};

/** The choice of the onboarding: arrow keys move between the cards, the chosen one shows a check mark. */
export const Group: Story = {
	render: () => {
		const [choice, setChoice] = createSignal('create');

		return (
			<ChoiceCardGroup legend='Что вы хотите сделать'>
				<ChoiceCard
					checked={choice() === 'create'}
					description='Для вас и семьи, приглашения потом'
					icon={<Plus/>}
					name='story-group'
					onChange={setChoice}
					title='Создать своё окружение'
					value='create'
				/>
				<ChoiceCard
					checked={choice() === 'invite'}
					description='Присоединиться к окружению близких'
					icon={<Plus/>}
					name='story-group'
					onChange={setChoice}
					title='У меня есть приглашение'
					value='invite'
				/>
			</ChoiceCardGroup>
		);
	}
};
