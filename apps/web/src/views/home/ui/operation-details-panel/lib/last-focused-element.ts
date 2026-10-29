let lastFocusedElement: HTMLElement | undefined;
let isTracking = false;

/**
 * The panel mounts after the row that opened it has already lost focus (a virtualized row is blurred while the selection
 * re-renders), so `document.activeElement` is `body` by then. Track focus from the start to know where it was.
 */
export function trackLastFocusedElement(): void {
	if (isTracking || typeof document === 'undefined') {
		return;
	}

	isTracking = true;
	document.addEventListener('focusin', (event) => {
		if (event.target instanceof HTMLElement) {
			lastFocusedElement = event.target;
		}
	}, true);
}

export function readLastFocusedElement(): HTMLElement | undefined {
	return lastFocusedElement?.isConnected ? lastFocusedElement : undefined;
}
