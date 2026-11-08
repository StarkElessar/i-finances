import type { JSX } from 'solid-js';

import { createToaster } from './create-toaster';
import { ToastContainer } from './toast-container';
import { ToasterContext } from './toaster-context';

export type ToasterProviderProps = {
	children: JSX.Element;
};

/** Mount once above the router: one toaster and one container for the whole application. */
export function ToasterProvider(props: ToasterProviderProps) {
	const toaster = createToaster();

	return (
		<ToasterContext.Provider value={toaster}>
			{props.children}
			<ToastContainer toaster={toaster}/>
		</ToasterContext.Provider>
	);
}
