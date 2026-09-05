import css from './category-form.module.scss';

import { Button } from '@/shared/ui';

import {
	formatCategoryAmount,
	readCategoryFields,
	toCategoryFormFields
} from '@/features/categories/model';

import type { CreateCategoryInput, PersistedCategory } from '@i-finances/contracts';
import { createEffect, createSignal, Show } from 'solid-js';

export type CategoryFormProps = {
	category: PersistedCategory | undefined;
	error: string | undefined;
	fieldErrors: Record<string, string> | undefined;
	onCancel: () => void;
	onSubmit: (fields: CreateCategoryInput) => Promise<void>;
	pending: boolean;
};

export function CategoryForm(props: CategoryFormProps) {
	const [color, setColor] = createSignal('#2563eb');
	const [description, setDescription] = createSignal('');
	const [keywords, setKeywords] = createSignal('');
	const [name, setName] = createSignal('');
	const [monthlyBudget, setMonthlyBudget] = createSignal('');
	const [formError, setFormError] = createSignal<string>();

	createEffect(() => {
		const category = props.category;
		const fields = category === undefined ? undefined : toCategoryFormFields(category);

		setColor(fields?.color ?? '#2563eb');
		setDescription(fields?.description ?? '');
		setKeywords(fields?.keywords.join(', ') ?? '');
		setName(fields?.name ?? '');
		setMonthlyBudget(formatCategoryAmount(fields?.monthlyBudgetMinor ?? null));
		setFormError(undefined);
	});

	const handleSubmit = async (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
		event.preventDefault();
		setFormError(undefined);

		const fields = readCategoryFields(new FormData(event.currentTarget));

		if (fields === undefined) {
			setFormError('Проверьте название, цвет, бюджет и ключевые слова категории.');
			return;
		}

		await props.onSubmit(fields);
	};

	return (
		<form class={css.form} onSubmit={handleSubmit}>
			<div class={css.heading}>
				<div class={css.headingContent}>
					<h3 class={css.title}>{props.category === undefined ? 'Новая категория' : 'Изменить категорию'}</h3>
					<Show when={props.category}>
						{(category) => <small class={css.version}>Версия {category().version}</small>}
					</Show>
				</div>
				<Show when={props.category !== undefined}>
					<button class={css.cancel} onClick={props.onCancel} type='button'>Отмена</button>
				</Show>
			</div>
			<label class={css.field}>
				<span>Название</span>
				<input
					class={css.input}
					maxlength='120'
					name='name'
					onInput={(event) => setName(event.currentTarget.value)}
					required
					value={name()}
				/>
				<Show when={props.fieldErrors?.name}>
					{(message) => <small class={css.fieldError}>{message()}</small>}
				</Show>
			</label>
			<label class={css.field}>
				<span>Описание</span>
				<textarea
					class={css.textarea}
					maxlength='2000'
					name='description'
					onInput={(event) => setDescription(event.currentTarget.value)}
					value={description()}
				/>
				<Show when={props.fieldErrors?.description}>
					{(message) => <small class={css.fieldError}>{message()}</small>}
				</Show>
			</label>
			<label class={css.field}>
				<span>Бюджет на месяц</span>
				<input
					class={css.input}
					inputmode='decimal'
					name='monthlyBudget'
					onInput={(event) => setMonthlyBudget(event.currentTarget.value)}
					placeholder='Оставьте пустым'
					value={monthlyBudget()}
				/>
				<Show when={props.fieldErrors?.monthlyBudgetMinor}>
					{(message) => <small class={css.fieldError}>{message()}</small>}
				</Show>
			</label>
			<label class={css.field}>
				<span>Цвет</span>
				<input
					class={css.colorInput}
					name='color'
					onInput={(event) => setColor(event.currentTarget.value)}
					type='color'
					value={color()}
				/>
				<Show when={props.fieldErrors?.color}>
					{(message) => <small class={css.fieldError}>{message()}</small>}
				</Show>
			</label>
			<label class={css.field}>
				<span>Ключевые слова</span>
				<textarea
					class={css.textarea}
					maxlength='2000'
					name='keywords'
					onInput={(event) => setKeywords(event.currentTarget.value)}
					placeholder='Продукты, супермаркет, магазин'
					value={keywords()}
				/>
				<small class={css.hint}>Разделяйте слова запятыми или переносами строк.</small>
				<Show when={props.fieldErrors?.keywords}>
					{(message) => <small class={css.fieldError}>{message()}</small>}
				</Show>
			</label>

			<Show when={formError() ?? props.error}>
				{(error) => <p class={css.error} role='alert'>{error()}</p>}
			</Show>
			<div class={css.actions}>
				<Button disabled={props.pending} loading={props.pending} type='submit'>
					{props.category === undefined ? 'Создать категорию' : 'Сохранить категорию'}
				</Button>
			</div>
		</form>
	);
}
