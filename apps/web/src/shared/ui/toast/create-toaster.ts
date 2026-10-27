import type { Accessor } from 'solid-js';
import { createSignal, getOwner, onCleanup } from 'solid-js';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export type ToastOptions = {
	message: string;
	tone?: ToastTone;
	/** Milliseconds; 0 keeps the toast until dismissed. Defaults: 4 s, 8 s with an action, persistent error. */
	duration?: number;
	action?: { label: string; onClick: () => void };
};

export type ToastEntry = ToastOptions & { id: number; tone: ToastTone };

export type Toaster = {
	toasts: Accessor<readonly ToastEntry[]>;
	show: (options: ToastOptions) => number;
	dismiss: (id: number) => void;
	clear: () => void;
	pause: (id: number, reason: 'hover' | 'focus') => void;
	resume: (id: number, reason: 'hover' | 'focus') => void;
};

type ToastTimer = {
	remaining: number;
	startedAt: number;
	paused: Set<'hover' | 'focus'>;
	timeout?: ReturnType<typeof setTimeout>;
};

/** Create inside a Solid owner (component or createRoot). Each instance owns and cleans up its timers. */
export function createToaster(): Toaster {
	if (!getOwner()) {
		throw new Error('createToaster must be called inside a Solid owner');
	}

	const [toasts, setToasts] = createSignal<readonly ToastEntry[]>([]);
	const timers = new Map<number, ToastTimer>();
	let nextId = 0;
	let disposed = false;

	const dismiss = (id: number): void => {
		clearTimeout(timers.get(id)?.timeout);
		timers.delete(id);
		setToasts((current) => current.filter((toast) => toast.id !== id));
	};

	const start = (id: number, timer: ToastTimer): void => {
		timer.startedAt = Date.now();
		timer.timeout = setTimeout(() => dismiss(id), timer.remaining);
	};

	const clear = (): void => {
		for (const timer of timers.values()) {
			clearTimeout(timer.timeout);
		}
		timers.clear();
		setToasts([]);
	};

	const show = (options: ToastOptions): number => {
		const id = ++nextId;
		const tone = options.tone ?? 'info';
		const duration = options.duration ?? (options.action ? 8000 : tone === 'error' ? 0 : 4000);

		if (!Number.isFinite(duration) || duration < 0) {
			throw new RangeError('Toast duration must be a finite non-negative number');
		}

		// Late async responses after the owner unmounts must not start new timers.
		if (disposed) {
			return id;
		}

		if (toasts().length === 3) {
			dismiss(toasts()[0].id);
		}

		setToasts((current) => [...current, { ...options, id, tone }]);

		if (duration > 0) {
			const timer: ToastTimer = { remaining: duration, startedAt: 0, paused: new Set() };
			timers.set(id, timer);
			start(id, timer);
		}

		return id;
	};

	const pause: Toaster['pause'] = (id, reason) => {
		const timer = timers.get(id);

		if (!timer || timer.paused.has(reason)) {
			return;
		}

		if (timer.paused.size === 0) {
			clearTimeout(timer.timeout);
			timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
		}

		timer.paused.add(reason);
	};

	const resume: Toaster['resume'] = (id, reason) => {
		const timer = timers.get(id);

		if (timer?.paused.delete(reason) && timer.paused.size === 0) {
			start(id, timer);
		}
	};

	onCleanup(() => {
		disposed = true;
		clear();
	});

	return { toasts, show, dismiss, clear, pause, resume };
}
