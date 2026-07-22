import css from './contact-card.module.scss';

import { Archive, Building2, ContactRound, UserRound } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Match, Show, Switch } from 'solid-js';

import type { Contact, ContactType } from '~/entities/contact';
import type { CurrencyCodeValue } from '~/shared/lib';
import { cn, formatMinorUnitsCurrency } from '~/shared/lib';

export type ContactCardProps = {
    contact: Contact;
    currency: CurrencyCodeValue;
    spentMinor: number;
    class?: string;
    draggable?: boolean;
    isDragging?: boolean;
    onClick?: () => void;
    onPointerCancel?: JSX.EventHandler<HTMLButtonElement, PointerEvent>;
    onPointerDown?: JSX.EventHandler<HTMLButtonElement, PointerEvent>;
    onPointerMove?: JSX.EventHandler<HTMLButtonElement, PointerEvent>;
    onPointerUp?: JSX.EventHandler<HTMLButtonElement, PointerEvent>;
    preview?: boolean;
};

export type ContactIconProps = {
    type: ContactType;
    size?: number;
};

function getContactCardStyle(contact: Contact): JSX.CSSProperties {
    return { '--contact-color': contact.color };
}

function getContactTypeLabel(type: ContactType): string {
    if (type === 'company') {
        return 'Компания';
    }

    if (type === 'person') {
        return 'Человек';
    }

    return 'Тип не указан';
}

export function ContactIcon(props: ContactIconProps): JSX.Element {
    const size = () => props.size ?? 21;

    return (
        <Switch fallback={<ContactRound size={size()} strokeWidth={2}/>}>
            <Match when={props.type === 'company'}>
                <Building2 size={size()} strokeWidth={2}/>
            </Match>
            <Match when={props.type === 'person'}>
                <UserRound size={size()} strokeWidth={2}/>
            </Match>
        </Switch>
    );
}

function ContactCardContent(props: Pick<ContactCardProps, 'contact' | 'currency' | 'spentMinor'>) {
    return (
        <>
            <span class={css.icon} aria-hidden='true'>
                <ContactIcon type={props.contact.type}/>
            </span>

            <span class={css.content}>
                <span class={css.name}>{props.contact.name}</span>
                <span class={css.meta}>
                    {props.contact.legalName ?? getContactTypeLabel(props.contact.type)}
                </span>
            </span>

            <span class={css.footer}>
                <span class={css.spent}>
                    <span>Потрачено в этом месяце</span>
                    <strong>{formatMinorUnitsCurrency(props.spentMinor, props.currency)}</strong>
                </span>
                <Show when={props.contact.isArchived}>
                    <span class={css.archiveState}><Archive size={14}/>В архиве</span>
                </Show>
            </span>
        </>
    );
}

export function ContactCard(props: ContactCardProps) {
    const className = () => cn(
        css.root,
        props.contact.isArchived && css.archived,
        props.draggable && css.draggable,
        props.isDragging && css.dragging,
        props.onClick && css.interactive,
        props.preview && css.preview,
        props.class
    );

    if (props.preview) {
        return (
            <div
                aria-hidden='true'
                class={className()}
                style={getContactCardStyle(props.contact)}
            >
                <ContactCardContent
                    contact={props.contact}
                    currency={props.currency}
                    spentMinor={props.spentMinor}
                />
            </div>
        );
    }

    return (
        <button
            class={className()}
            style={getContactCardStyle(props.contact)}
            type='button'
            onClick={props.onClick}
            onPointerCancel={props.onPointerCancel}
            onPointerDown={props.onPointerDown}
            onPointerMove={props.onPointerMove}
            onPointerUp={props.onPointerUp}
        >
            <ContactCardContent
                contact={props.contact}
                currency={props.currency}
                spentMinor={props.spentMinor}
            />
        </button>
    );
}
