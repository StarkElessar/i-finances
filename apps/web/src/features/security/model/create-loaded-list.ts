import type { Accessor } from 'solid-js';
import { createSignal, onCleanup, onMount } from 'solid-js';

export type LoadedListState<TItem> =
	| { kind: 'loading' }
	| { kind: 'error'; message: string }
	/** `isRefreshing`: a newer copy is on its way, the one shown stays until it arrives. */
	| { isRefreshing: boolean; items: readonly TItem[]; kind: 'ready' };

export type LoadedList<TItem> = {
	/** Loads again. The list on screen stays while the new one comes; a failure of a refresh keeps it too. */
	reload: () => Promise<void>;
	state: Accessor<LoadedListState<TItem>>;
};

/**
 * A list loaded when the block appears and again on demand, with plain signals instead of a resource: a resource read
 * under a `Suspense` boundary would replace the whole page with its fallback on every reload. A newer load wins; an
 * answer that arrives after the block is gone is dropped.
 *
 * `load` resolves with the items or rejects (or throws) with the message to show when the first load fails.
 */
export function createLoadedList<TItem>(load: () => Promise<readonly TItem[]>, failureMessage: string): LoadedList<TItem> {
	const [state, setState] = createSignal<LoadedListState<TItem>>({ kind: 'loading' });
	let generation = 0;
	let disposed = false;

	const reload = async (): Promise<void> => {
		generation += 1;

		const current = generation;
		const previous = state();

		setState(previous.kind === 'ready' ? { ...previous, isRefreshing: true } : { kind: 'loading' });

		try {
			const items = await load();

			if (!disposed && current === generation) {
				setState({ isRefreshing: false, items, kind: 'ready' });
			}
		}
		catch {
			if (!disposed && current === generation) {
				setState(previous.kind === 'ready' ? { ...previous, isRefreshing: false } : { kind: 'error', message: failureMessage });
			}
		}
	};

	onMount(() => void reload());
	onCleanup(() => {
		disposed = true;
	});

	return { reload, state };
}
