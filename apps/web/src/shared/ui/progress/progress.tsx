import css from './progress.module.scss';

import { cn } from '@/shared/lib';

export type ProgressTone = 'info' | 'warning' | 'danger';

export type ProgressProps = {
	/** Percentage; the track is clamped to 0–100 while aria-valuetext can explain an overrun. */
	value: number;
	'aria-label': string;
	'aria-valuetext'?: string;
	tone?: ProgressTone;
	class?: string;
};

const toneClasses: Record<ProgressTone, string> = { info: css.info, warning: css.warning, danger: css.danger };

/** Budget usage track from the category cards. */
export function Progress(props: ProgressProps) {
	const value = () => Number.isFinite(props.value) ? Math.min(100, Math.max(0, props.value)) : 0;

	return (
		<div
			aria-label={props['aria-label']}
			aria-valuemax={100}
			aria-valuemin={0}
			aria-valuenow={value()}
			aria-valuetext={props['aria-valuetext']}
			class={cn(css.root, toneClasses[props.tone ?? 'info'], props.class)}
			role='progressbar'
		>
			<span class={css.fill} style={{ width: `${value()}%` }}/>
		</div>
	);
}
