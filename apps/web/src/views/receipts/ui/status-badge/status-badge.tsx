import css from './status-badge.module.scss';

import { cn } from '@/shared/lib';

import type { ReceiptImportStatus } from '@/entities/receipt-import';

import { Show } from 'solid-js';

type StatusPresentation = {
	label: string;
	tone: 'danger' | 'muted' | 'primary' | 'success' | 'warning';
};

export const STATUS_PRESENTATION: Record<
	ReceiptImportStatus,
	StatusPresentation
> = {
	approved: { label: 'Операции созданы', tone: 'success' },
	approving: { label: 'Создаём операции', tone: 'primary' },
	cancelled: { label: 'Отменён', tone: 'muted' },
	failed: { label: 'Ошибка обработки', tone: 'danger' },
	needs_review: { label: 'Нужно проверить', tone: 'warning' },
	processing: { label: 'Обрабатывается', tone: 'primary' },
	queued: { label: 'В очереди', tone: 'muted' },
	revision_requested: { label: 'Отправлен на доработку', tone: 'primary' }
};

export const ACTIVE_STATUSES = new Set<ReceiptImportStatus>([
	'approving',
	'processing',
	'queued',
	'revision_requested'
]);

// `css[...]` lookups can't use the raw kebab-case class names: Vite's
// `localsConvention: 'camelCaseOnly'` only exposes the camelCase key, so a
// dynamic `status-${tone}` string always misses and silently drops the tone
// color. Look tones up through this map instead of building the key at runtime.
const TONE_CLASS_NAME: Record<StatusPresentation['tone'], string> = {
	danger: css.statusDanger,
	muted: css.statusMuted,
	primary: css.statusPrimary,
	success: css.statusSuccess,
	warning: css.statusWarning
};

export function StatusBadge(props: { status: ReceiptImportStatus }) {
	const presentation = () => STATUS_PRESENTATION[props.status];

	return (
		<span
			class={cn(
				css.status,
				TONE_CLASS_NAME[presentation().tone]
			)}
		>
			<Show when={ACTIVE_STATUSES.has(props.status)}>
				<span aria-hidden='true' class={css.statusSpinner}/>
			</Show>
			{presentation().label}
		</span>
	);
}
