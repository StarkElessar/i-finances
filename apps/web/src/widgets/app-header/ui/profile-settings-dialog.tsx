import css from './profile-settings-dialog.module.scss';

import { cn } from '@/shared/lib';
import { Button, Dialog, TextField } from '@/shared/ui';

import type { OperationsDisplayModePreference } from '@/entities/operation';
import { useOperationsDisplayMode } from '@/entities/operation';
import { useCurrentViewer, useSetCurrentViewer } from '@/entities/viewer';

import type { AuthClient } from '@/features/auth';

import { createEffect, createSignal, For } from 'solid-js';

const DISPLAY_MODE_OPTIONS: Array<{ label: string; value: OperationsDisplayModePreference }> = [
	{ label: 'Авто', value: 'auto' },
	{ label: 'Таблица', value: 'table' },
	{ label: 'Список', value: 'list' }
];

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
	const displayMode = useOperationsDisplayMode();

	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content>
				<Dialog.Header closeLabel='Закрыть настройки профиля'>
					<Dialog.Kicker>Профиль</Dialog.Kicker>
					<Dialog.Title>Настройки</Dialog.Title>
				</Dialog.Header>
				<Dialog.Body>
					<section class={css.section}>
						<h3 class={css.sectionTitle}>Отображение операций</h3>
						<p class={css.sectionDescription}>
							Как показывать список операций на счёте: таблицей, компактным
							списком или автоматически в зависимости от ширины экрана.
						</p>
						<div aria-label='Отображение операций' class={css.segmentedControl} role='group'>
							<For each={DISPLAY_MODE_OPTIONS}>
								{(option) => (
									<button
										aria-pressed={displayMode.preference() === option.value}
										class={cn(
											css.segmentedOption,
											displayMode.preference() === option.value && css.segmentedOptionActive
										)}
										type='button'
										onClick={() => displayMode.setPreference(option.value)}
									>
										{option.label}
									</button>
								)}
							</For>
						</div>
					</section>
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
