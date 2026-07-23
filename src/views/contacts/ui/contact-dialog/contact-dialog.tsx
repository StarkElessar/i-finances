import css from './contact-dialog.module.scss';

import { ArchiveRestore } from 'lucide-solid';
import { createEffect, createSignal, createUniqueId, Show } from 'solid-js';

import { ContactCard } from '../contact-card';

import type {
    ContactType,
    PersistedContact
} from '~/entities/contact';
import { AccentColor, CurrencyCode, type CurrencyCodeValue } from '~/shared/lib';
import { Button } from '~/shared/ui/button';
import { ColorPicker } from '~/shared/ui/color-picker';
import { Dialog } from '~/shared/ui/dialog';
import { Switch } from '~/shared/ui/switch';
import { TextField } from '~/shared/ui/text-field';

export type ContactDialogMode = 'create' | 'edit';

export type ContactDialogValue = {
    color: string;
    legalName: string | null;
    name: string;
    type: Exclude<ContactType, 'unknown'>;
};

export type ContactDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (value: ContactDialogValue) => void;
    currency?: CurrencyCodeValue;
    error?: string;
    fieldErrors?: Record<string, string>;
    initialValue?: ContactDialogValue;
    isArchived?: boolean;
    loading?: boolean;
    mode?: ContactDialogMode;
    onRestore?: () => Promise<void> | void;
    restoreLoading?: boolean;
};

const DEFAULT_CONTACT_COLOR = AccentColor.BLUE;

function createPreviewContact(value: ContactDialogValue): PersistedContact {
    const timestamp = '2026-01-01T00:00:00.000Z';

    return {
        ...value,
        archivedAt: null,
        createdAt: timestamp,
        id: 'contact-preview',
        updatedAt: timestamp,
        version: 1
    };
}

export function ContactDialog(props: ContactDialogProps) {
    const companySwitchId = createUniqueId();
    const [color, setColor] = createSignal<string>(DEFAULT_CONTACT_COLOR);
    const [legalName, setLegalName] = createSignal('');
    const [name, setName] = createSignal('');
    const [type, setType] = createSignal<Exclude<ContactType, 'unknown'>>('person');

    const mode = () => props.mode ?? 'create';
    const isCompany = () => type() === 'company';
    const isEditMode = () => mode() === 'edit';
    const dialogTitle = () => isEditMode() ? 'Редактирование контакта' : 'Новый контакт';
    const submitLabel = () => isEditMode() ? 'Сохранить' : 'Добавить контакт';
    const normalizedName = () => name().trim().replace(/\s+/g, ' ');
    const normalizedLegalName = () => legalName().trim().replace(/\s+/g, ' ');
    const isSubmitDisabled = () => normalizedName().length === 0;
    const dialogValue = (): ContactDialogValue => ({
        color: color(),
        legalName: isCompany() ? normalizedLegalName() || null : null,
        name: normalizedName() || (isCompany() ? 'Новая компания' : 'Новый контакт'),
        type: type()
    });

    createEffect(() => {
        if (props.open) {
            const initialValue = props.initialValue;

            setColor(initialValue?.color ?? DEFAULT_CONTACT_COLOR);
            setLegalName(initialValue?.legalName ?? '');
            setName(initialValue?.name ?? '');
            setType(initialValue?.type ?? 'person');
        }
    });

    const handleCompanyChange = (event: Event & { currentTarget: HTMLInputElement }) => {
        setType(event.currentTarget.checked ? 'company' : 'person');
    };

    const handleNameInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setName(event.currentTarget.value);
    };

    const handleLegalNameInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setLegalName(event.currentTarget.value);
    };

    const handleRestore = () => {
        void props.onRestore?.();
    };

    const handleSubmit = (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
        event.preventDefault();
        const submitName = normalizedName();

        if (submitName.length > 0) {
            props.onSubmit({
                color: color(),
                legalName: isCompany() ? normalizedLegalName() || null : null,
                name: submitName,
                type: type()
            });
        }
    };

    return (
        <Dialog.Root
            closeOnBackdropClick={!props.loading && !props.restoreLoading}
            closeOnEscape={!props.loading && !props.restoreLoading}
            open={props.open}
            onOpenChange={props.onOpenChange}
        >
            <Dialog.Content as='form' class={css.dialog} onSubmit={handleSubmit}>
                <Dialog.Header
                    closeLabel='Закрыть окно контакта'
                    hideCloseButton={props.loading || props.restoreLoading}
                >
                    <Dialog.Title>{dialogTitle()}</Dialog.Title>
                    <Dialog.Description>
                        Человек или компания, связанные с доходами и расходами
                    </Dialog.Description>
                </Dialog.Header>

                <Dialog.Body>
                    <fieldset
                        class={css.form}
                        disabled={props.loading || props.restoreLoading}
                    >
                        <div class={css.typeField}>
                            <div class={css.typeContent}>
                                <label class={css.typeLabel} for={companySwitchId}>Контакт компании</label>
                                <span class={css.typeHint}>
                                    {isCompany() ? 'Юридическое лицо или бренд' : 'Физическое лицо'}
                                </span>
                            </div>
                            <Switch
                                checked={isCompany()}
                                id={companySwitchId}
                                onChange={handleCompanyChange}
                            />
                        </div>

                        <TextField
                            error={props.fieldErrors?.name}
                            label='Название'
                            maxLength={120}
                            placeholder={isCompany() ? 'Например, Пицца Лисица' : 'Например, Алексей'}
                            required
                            value={name()}
                            onInput={handleNameInput}
                        />

                        <Show when={isCompany()}>
                            <TextField
                                hint='Официальное название из документов, если оно отличается'
                                label='Юридическое название'
                                maxLength={180}
                                optional
                                placeholder='Например, ООО Легкий ужин'
                                value={legalName()}
                                onInput={handleLegalNameInput}
                            />
                        </Show>

                        <ColorPicker label='Цвет' value={color()} onChange={setColor}/>

                        <div class={css.previewBlock}>
                            <div class={css.previewLabel}>Превью</div>
                            <ContactCard
                                contact={createPreviewContact(dialogValue())}
                                currency={props.currency ?? CurrencyCode.BYN}
                                preview
                                spentMinor={0}
                            />
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
                            disabled={isSubmitDisabled() || props.restoreLoading}
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
