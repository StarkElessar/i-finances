import css from './contact-card.module.scss';

import type { CurrencyCodeValue } from '~/shared/lib';
import { cn, formatMinorUnitsCurrency } from '~/shared/lib';
import { Button } from '~/shared/ui';

import type {
	ContactType,
	PersistedContact
} from '~/entities/contact';

import {
	Archive,
	Building2,
	ContactRound,
	Pencil,
	UserRound
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import {
	Match,
	Show,
	Switch
} from 'solid-js';

/**
 * Props for a contact spend card with optional click, edit and drag actions.
 */
export type ContactCardProps = {
	contact: PersistedContact;
	currency: CurrencyCodeValue;
	spentMinor: number;
	class?: string;
	draggable?: boolean;
	isDragging?: boolean;
	onClick?: () => void;
	onEdit?: () => void;
	onPointerCancel?: JSX.EventHandler<HTMLElement, PointerEvent>;
	onPointerDown?: JSX.EventHandler<HTMLElement, PointerEvent>;
	onPointerMove?: JSX.EventHandler<HTMLElement, PointerEvent>;
	onPointerUp?: JSX.EventHandler<HTMLElement, PointerEvent>;
	preview?: boolean;
};

/**
 * Props for the contact type icon.
 */
export type ContactIconProps = {
	type: ContactType;
	size?: number;
};

/**
 * Builds CSS custom properties for the contact accent color.
 */
function getContactCardStyle(
	contact: PersistedContact
): JSX.CSSProperties {
	return { '--contact-color': contact.color };
}

/**
 * Returns a human-readable label for the contact type.
 */
function getContactTypeLabel(type: ContactType): string {
	if (type === 'company') {
		return 'Компания';
	}

	if (type === 'person') {
		return 'Человек';
	}

	return 'Тип не указан';
}

/**
 * Renders an icon for person, company, or unspecified contact types.
 */
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

/**
 * Renders the shared visual content of a contact card.
 */
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
				<Show when={props.contact.archivedAt !== null}>
					<span class={css.archiveState}><Archive size={14}/>В архиве</span>
				</Show>
			</span>
		</>
	);
}

/**
 * Contact spend card with optional summary click, edit control, and archive drag.
 */
export function ContactCard(props: ContactCardProps) {
	const className = () => cn(
		css.root,
		props.contact.archivedAt !== null && css.archived,
		props.draggable && css.draggable,
		props.isDragging && css.dragging,
		props.onClick && css.interactive,
		props.preview && css.preview,
		props.class
	);

	const handleEditClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
		event.stopPropagation();
		props.onEdit?.();
	};

	const handleEditPointerDown: JSX.EventHandler<HTMLButtonElement, PointerEvent> = (event) => {
		event.stopPropagation();
	};

	if (props.preview) {
		return (
			<div
				aria-hidden='true'
				class={className()}
				style={getContactCardStyle(props.contact)}
			>
				<div class={css.body}>
					<ContactCardContent
						contact={props.contact}
						currency={props.currency}
						spentMinor={props.spentMinor}
					/>
				</div>
			</div>
		);
	}

	return (
		<article
			class={className()}
			style={getContactCardStyle(props.contact)}
		>
			{/* Drag capture + click must share one node, or click never fires. */}
			<Show
				fallback={(
					<div
						class={css.body}
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
					</div>
				)}
				when={props.onClick}
			>
				<button
					class={css.body}
					type='button'
					onClick={() => props.onClick?.()}
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
			</Show>

			<Show when={props.onEdit}>
				<Button
					aria-label={`Редактировать контакт ${props.contact.name}`}
					class={css.editButton}
					iconOnly
					size='sm'
					title='Редактировать контакт'
					type='button'
					variant='ghost'
					onClick={handleEditClick}
					onPointerDown={handleEditPointerDown}
				>
					<Pencil size={15}/>
				</Button>
			</Show>
		</article>
	);
}
