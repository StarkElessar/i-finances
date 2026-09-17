import css from './profile-settings-dialog.module.scss';

import { cn } from '@/shared/lib';
import { Dialog } from '@/shared/ui';

import type { OperationsDisplayModePreference } from '@/entities/operation';
import { useOperationsDisplayMode } from '@/entities/operation';

import { For } from 'solid-js';

const DISPLAY_MODE_OPTIONS: Array<{ label: string; value: OperationsDisplayModePreference }> = [
	{ label: 'Авто', value: 'auto' },
	{ label: 'Таблица', value: 'table' },
	{ label: 'Список', value: 'list' }
];

export type ProfileSettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

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
