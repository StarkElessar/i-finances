import type { Accessor } from 'solid-js';
import { createSignal, onCleanup } from 'solid-js';

/**
 * Reactive wrapper around `window.matchMedia`. Browser-only — call it from
 * component/module setup code that only runs in the browser (this app is a
 * plain SPA with no SSR, so that's everywhere).
 */
export function useMediaQuery(query: string): Accessor<boolean> {
	const mediaQueryList = window.matchMedia(query);
	const [matches, setMatches] = createSignal(mediaQueryList.matches);
	const handleChange = () => setMatches(mediaQueryList.matches);

	mediaQueryList.addEventListener('change', handleChange);
	onCleanup(() => mediaQueryList.removeEventListener('change', handleChange));

	return matches;
}
