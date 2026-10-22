import { PageCard } from '@/shared/ui';

import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { WelcomeChoice } from '../model/read-welcome-form';

import { OnboardingCreateCard } from './onboarding-create-card';
import { OnboardingWelcomeCard } from './onboarding-welcome-card';

const noop = () => {};

// The cards of the board `Flow-Onboarding`, inside the page frame.
const meta = {
	title: 'Household/Onboarding',
	component: OnboardingWelcomeCard,
	args: {
		canContinue: true,
		choice: 'create',
		displayName: 'Алексей',
		link: '',
		onChoice: noop,
		onContinue: noop,
		onDisplayNameInput: noop,
		onLinkInput: noop,
		onSignOut: noop
	},
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof OnboardingWelcomeCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** 1. Добро пожаловать; the choice is live. */
export const Welcome: Story = {
	render: () => {
		const [choice, setChoice] = createSignal<WelcomeChoice>('create');

		return (
			<PageCard>
				<OnboardingWelcomeCard
					canContinue
					choice={choice()}
					displayName='Алексей'
					link=''
					onChoice={setChoice}
					onContinue={noop}
					onDisplayNameInput={noop}
					onLinkInput={noop}
					onSignOut={noop}
				/>
			</PageCard>
		);
	}
};

/** 2. Есть приглашение, ссылка не подошла. */
export const BadLink: Story = {
	render: () => (
		<PageCard>
			<OnboardingWelcomeCard
				canContinue={false}
				choice='invite'
				displayName='Алексей'
				link='ifinances.example/invite#abc'
				linkError='Это не похоже на приглашение. Скопируйте ссылку целиком'
				onChoice={noop}
				onContinue={noop}
				onDisplayNameInput={noop}
				onLinkInput={noop}
				onSignOut={noop}
			/>
		</PageCard>
	)
};

/** 3. Ошибка имени. */
export const NameError: Story = {
	render: () => (
		<PageCard>
			<OnboardingWelcomeCard
				canContinue={false}
				choice='create'
				displayName=''
				displayNameError='Введите имя.'
				link=''
				onChoice={noop}
				onContinue={noop}
				onDisplayNameInput={noop}
				onLinkInput={noop}
				onSignOut={noop}
			/>
		</PageCard>
	)
};

/** 6. Вас удалили из окружения. */
export const RemovedFromHousehold: Story = {
	render: () => (
		<PageCard>
			<OnboardingWelcomeCard
				canContinue
				choice='create'
				displayName='Алексей'
				link=''
				lostHouseholdName='Семья'
				onChoice={noop}
				onContinue={noop}
				onDisplayNameInput={noop}
				onLinkInput={noop}
				onSignOut={noop}
			/>
		</PageCard>
	)
};

/** 4. Создание окружения. */
export const Create: Story = {
	render: () => (
		<PageCard>
			<OnboardingCreateCard name='Семья' onBack={noop} onNameInput={noop} onSubmit={noop}/>
		</PageCard>
	)
};

/** 5. Ошибки создания. */
export const CreateErrors: Story = {
	render: () => (
		<PageCard>
			<OnboardingCreateCard
				error='Не удалось создать окружение. Проверьте соединение и повторите.'
				name=''
				nameError='Введите название окружения.'
				onBack={noop}
				onNameInput={noop}
				onSubmit={noop}
			/>
		</PageCard>
	)
};
