import css from './profile-settings-dialog.module.scss';

import type { DisplayModePreference, DisplayModePreferenceControls } from '@/shared/lib';
import { cn } from '@/shared/lib';
import { Button, Dialog, TextField } from '@/shared/ui';

import { useOperationsDisplayMode } from '@/entities/operation';
import { useReceiptsDisplayMode } from '@/entities/receipt-import';
import { useCurrentViewer, useSetCurrentViewer } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';

import { createEffect, createSignal, For } from 'solid-js';

const DISPLAY_MODE_OPTIONS: Array<{ label: string; value: DisplayModePreference }> = [
	{ label: 'Авто', value: 'auto' },
	{ label: 'Таблица', value: 'table' },
	{ label: 'Список', value: 'list' }
];

function DisplayModeSection(props: {
	ariaLabel: string;
	controls: DisplayModePreferenceControls;
	description: string;
	title: string;
}) {
	return (
		<section class={css.section}>
			<h3 class={css.sectionTitle}>{props.title}</h3>
			<p class={css.sectionDescription}>{props.description}</p>
			<div aria-label={props.ariaLabel} class={css.segmentedControl} role='group'>
				<For each={DISPLAY_MODE_OPTIONS}>
					{(option) => (
						<button
							aria-pressed={props.controls.preference() === option.value}
							class={cn(
								css.segmentedOption,
								props.controls.preference() === option.value && css.segmentedOptionActive
							)}
							type='button'
							onClick={() => props.controls.setPreference(option.value)}
						>
							{option.label}
						</button>
					)}
				</For>
			</div>
		</section>
	);
}

export type ProfileSettingsDialogProps = {
	authClient: AuthClient;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function DisplayNameSection(props: { authClient: AuthClient }) {
	const viewer = useCurrentViewer();
	const setCurrentViewer = useSetCurrentViewer();
	const [displayName, setDisplayName] = createSignal('');
	const [isSaving, setIsSaving] = createSignal(false);
	const [error, setError] = createSignal<string>();

	createEffect(() => {
		setDisplayName(viewer()?.displayName ?? '');
	});

	const isUnchanged = () => displayName().trim() === (viewer()?.displayName ?? '').trim();

	const handleSubmit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();

		if (isUnchanged() || isSaving()) {
			return;
		}

		setError(undefined);
		setIsSaving(true);

		try {
			const result = await props.authClient.updateDisplayName(displayName());

			if (result.ok) {
				setDisplayName(result.displayName);
				setCurrentViewer({ displayName: result.displayName });
			}
			else {
				setError(result.message);
			}
		}
		catch {
			setError('Не удалось сохранить имя. Попробуйте ещё раз.');
		}
		finally {
			setIsSaving(false);
		}
	};

	return (
		<section class={css.section}>
			<h3 class={css.sectionTitle}>Отображаемое имя</h3>
			<p class={css.sectionDescription}>
				Как вас видят в приложении — в шапке и меню профиля.
			</p>
			<form class={css.displayNameForm} onSubmit={(event) => void handleSubmit(event)}>
				<TextField
					disabled={isSaving()}
					error={error()}
					maxLength={100}
					value={displayName()}
					onInput={(event) => setDisplayName(event.currentTarget.value)}
				/>
				<Button
					disabled={isUnchanged() || displayName().trim().length === 0}
					loading={isSaving()}
					type='submit'
				>
					Сохранить
				</Button>
			</form>
		</section>
	);
}

export function ProfileSettingsDialog(props: ProfileSettingsDialogProps) {
	const operationsDisplayMode = useOperationsDisplayMode();
	const receiptsDisplayMode = useReceiptsDisplayMode();

	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content>
				<Dialog.Header closeLabel='Закрыть настройки профиля'>
					<Dialog.Kicker>Профиль</Dialog.Kicker>
					<Dialog.Title>Настройки</Dialog.Title>
				</Dialog.Header>
				<Dialog.Body class={css.sections}>
					<DisplayModeSection
						ariaLabel='Отображение операций'
						controls={operationsDisplayMode}
						description='Как показывать список операций на счёте: таблицей, компактным
							списком или автоматически в зависимости от ширины экрана.'
						title='Отображение операций'
					/>
					<DisplayModeSection
						ariaLabel='Отображение чеков'
						controls={receiptsDisplayMode}
						description='Как показывать список чеков: таблицей, компактным списком
							или автоматически в зависимости от ширины экрана.'
						title='Отображение чеков'
					/>
					<DisplayNameSection authClient={props.authClient}/>
				</Dialog.Body>
				<Dialog.Footer>
					<Dialog.Action closeOnClick intent='cancel'>
						Закрыть
					</Dialog.Action>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	);
}
