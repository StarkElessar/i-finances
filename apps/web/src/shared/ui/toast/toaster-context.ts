import { createContext, useContext } from 'solid-js';

import type { Toaster } from './create-toaster';

export const ToasterContext = createContext<Toaster>();

/** The application-wide toaster; toasts live above the router, so they survive page changes. */
export function useToaster(): Toaster {
	const toaster = useContext(ToasterContext);

	if (!toaster) {
		throw new Error('useToaster must be used inside ToasterProvider');
	}

	return toaster;
}
