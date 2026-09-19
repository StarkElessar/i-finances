import type { ReceiptProcessingJob } from '@/entities/receipt-import';

export function formatDateTime(value: string): string {
	return new Intl.DateTimeFormat('ru-RU', {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(new Date(value));
}

export function formatFileSize(sizeBytes: number): string {
	return sizeBytes >= 1024 * 1024
		? `${(sizeBytes / 1024 / 1024).toFixed(1)} МБ`
		: `${Math.ceil(sizeBytes / 1024)} КБ`;
}

export function formatDuration(durationMs: number): string {
	const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return minutes > 0 ? `${minutes} мин ${seconds} с` : `${seconds} с`;
}

// `completedAt` is set for both a successful and a failed attempt, so this is a
// valid total for any terminal job; for one still running it falls back to "now".
export function getProcessingDurationMs(job: ReceiptProcessingJob): number {
	const startedAt = new Date(job.createdAt).getTime();
	const endedAt = job.completedAt === null ? Date.now() : new Date(job.completedAt).getTime();

	return endedAt - startedAt;
}

export function formatProcessingDuration(job: ReceiptProcessingJob): string {
	const durationLabel = formatDuration(getProcessingDurationMs(job));

	return job.completedAt === null ? `${durationLabel}…` : durationLabel;
}
