import css from './category-dialog.module.scss';

import { ArchiveRestore } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { createEffect, createSignal, Show } from 'solid-js';

import { KeywordInput } from '../keyword-input';

import {
    formatMinorUnitsAsInput,
    formatMinorUnitsCurrency,
    parseOptionalMoneyInputToMinorUnits
} from '~/entities/category';
import { AccentColor, CurrencyCode, type CurrencyCodeValue } from '~/shared/lib';
import { Button, Dialog, TextField } from '~/shared/ui';
import { ColorPicker } from '~/shared/ui/color-picker';

export type CategoryDialogMode = 'create' | 'edit';

export type CategoryDialogValue = {
    color: string;
    keywords: string[];
    monthlyBudgetMinor: number | null;
    name: string;
};

export type CategoryDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (value: CategoryDialogValue) => Promise<void> | void;
    currency?: CurrencyCodeValue;
    error?: string;
    fieldErrors?: Record<string, string>;
    initialValue?: CategoryDialogValue;
    isArchived?: boolean;
    loading?: boolean;
    mode?: CategoryDialogMode;
    onRestore?: () => Promise<void> | void;
    restoreLoading?: boolean;
};

const DEFAULT_CATEGORY_COLOR = AccentColor.BLUE;

function getPreviewStyle(color: string): JSX.CSSProperties {
    return {
        '--category-color': color
    };
}

function resolveBudgetInputValue(monthlyBudgetMinor: number | null | undefined): string {
    return monthlyBudgetMinor ? formatMinorUnitsAsInput(monthlyBudgetMinor) : '';
}

function resolvePositiveBudget(value: number | null | undefined): number | null {
    if (!value || value <= 0) {
        return null;
    }

    return value;
}

export function CategoryDialog(props: CategoryDialogProps) {
    const [categoryName, setCategoryName] = createSignal('');
    const [categoryBudget, setCategoryBudget] = createSignal('');
    const [categoryColor, setCategoryColor] = createSignal<string>(DEFAULT_CATEGORY_COLOR);
    const [keywords, setKeywords] = createSignal<string[]>([]);
    const [budgetError, setBudgetError] = createSignal<string>();

    const mode = () => props.mode ?? 'create';
    const currency = () => props.currency ?? CurrencyCode.BYN;
    const isEditMode = () => mode() === 'edit';

    const parsedBudget = () => parseOptionalMoneyInputToMinorUnits(categoryBudget());
    const previewBudget = () => resolvePositiveBudget(parsedBudget());
    const dialogTitle = () => isEditMode() ? 'Редактирование категории' : 'Новая категория';
    const submitLabel = () => isEditMode() ? 'Сохранить' : 'Добавить категорию';

    createEffect(() => {
        if (props.open) {
            const initialValue = props.initialValue;

            setCategoryName(initialValue?.name ?? '');
            setCategoryBudget(resolveBudgetInputValue(initialValue?.monthlyBudgetMinor));
            setCategoryColor(initialValue?.color ?? DEFAULT_CATEGORY_COLOR);
            setKeywords([...(initialValue?.keywords ?? [])]);
            setBudgetError(undefined);
        }
    });

    const handleOpenChange = (open: boolean) => {
        props.onOpenChange(open);
    };

    const handleNameInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setCategoryName(event.currentTarget.value);
    };

    const handleBudgetInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setCategoryBudget(event.currentTarget.value);
        setBudgetError(undefined);
    };

    const handleSubmit = (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
        event.preventDefault();

        const name = categoryName().trim();
        const budget = parsedBudget();

        if (!name) {
            return;
        }

        if (budget === undefined) {
            setBudgetError('Введите сумму с копейками, например 10000,00');
            return;
        }

        props.onSubmit({
            color: categoryColor(),
            keywords: keywords(),
            monthlyBudgetMinor: resolvePositiveBudget(budget),
            name
        });
    };

    const handleRestore = () => {
        void props.onRestore?.();
    };

    return (
        <Dialog.Root
            closeOnBackdropClick={!props.loading && !props.restoreLoading}
            closeOnEscape={!props.loading && !props.restoreLoading}
            open={props.open}
            onOpenChange={handleOpenChange}
        >
            <Dialog.Content
                as='form'
                class={css.dialog}
                onSubmit={handleSubmit}
            >
                <Dialog.Header
                    closeLabel='Закрыть окно категории'
                    hideCloseButton={props.loading || props.restoreLoading}
                >
                    <Dialog.Title>{dialogTitle()}</Dialog.Title>
                    <Dialog.Description>Группа трат с месячным бюджетом и ключевыми словами</Dialog.Description>
                </Dialog.Header>

                <Dialog.Body>
                    <fieldset
                        class={css.form}
                        disabled={props.loading || props.restoreLoading}
                    >
                        <TextField
                            error={props.fieldErrors?.name}
                            label='Название'
                            maxLength={120}
                            placeholder='Например, Подписки'
                            required
                            value={categoryName()}
                            onInput={handleNameInput}
                        />

                        <TextField
                            error={budgetError() ?? props.fieldErrors?.monthlyBudgetMinor}
                            hint='Оставьте пустым, если лимит пока не нужен'
                            inputMode='decimal'
                            label='Бюджет на месяц'
                            placeholder='10000,00'
                            value={categoryBudget()}
                            onInput={handleBudgetInput}
                        />

                        <ColorPicker
                            label='Цвет'
                            value={categoryColor()}
                            onChange={setCategoryColor}
                        />

                        <KeywordInput
                            error={props.fieldErrors?.keywords}
                            hint='Запятая или Enter создают чипс'
                            label='Ключевые слова'
                            value={keywords()}
                            onChange={setKeywords}
                        />

                        <div class={css.previewBlock}>
                            <div class={css.previewLabel}>Превью</div>
                            <div class={css.previewCard} style={getPreviewStyle(categoryColor())}>
                                <span class={css.previewIcon} aria-hidden='true'>
                                    <span/>
                                </span>
                                <span class={css.previewContent}>
                                    <span class={css.previewTitle}>{categoryName().trim() || 'Новая категория'}</span>
                                    <span>
                                        {previewBudget()
                                            ? `Бюджет ${formatMinorUnitsCurrency(previewBudget() as number, currency())}`
                                            : 'Без бюджета'}
                                    </span>
                                </span>
                                <Show when={previewBudget()}>
                                    <span class={css.previewProgress} aria-hidden='true'>
                                        <span/>
                                    </span>
                                    <span class={css.previewFooter}>
                                        Расход
                                        <span>0% использовано</span>
                                    </span>
                                </Show>
                            </div>
                        </div>
                    </fieldset>

                    <Show when={props.error}>
                        <p class={css.error} role='alert'>{props.error}</p>
                    </Show>
                </Dialog.Body>

                <Dialog.Footer class={css.footer}>
                    <Show when={isEditMode() && props.isArchived && props.onRestore}>
                        <Button
                            loading={props.restoreLoading}
                            type='button'
                            variant='secondary'
                            onClick={handleRestore}
                        >
                            <ArchiveRestore size={17}/>
                            Вернуть из архива
                        </Button>
                    </Show>
                    <span class={css.footerSpacer}/>
                    <div class={css.footerActions}>
                        <Dialog.Action
                            closeOnClick
                            disabled={props.loading || props.restoreLoading}
                            intent='cancel'
                        >
                            Отмена
                        </Dialog.Action>
                        <Button
                            disabled={!categoryName().trim() || props.restoreLoading}
                            loading={props.loading}
                            type='submit'
                        >
                            {submitLabel()}
                        </Button>
                    </div>
                </Dialog.Footer>
            </Dialog.Content>
        </Dialog.Root>
    );
}
