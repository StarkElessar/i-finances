import {
	createAsync,
	type RouteDefinition,
	type RouteSectionProps
} from '@solidjs/router';

import { CurrentViewerProvider, getCurrentViewer } from '~/entities/viewer';
import { AppHeader } from '~/widgets/app-header';

export const route = {
	preload: () => getCurrentViewer()
} satisfies RouteDefinition;

export default function AppLayout(props: RouteSectionProps) {
	const currentViewer = createAsync(() => getCurrentViewer());

	return (
		<CurrentViewerProvider viewer={currentViewer}>
			<AppHeader/>
			{props.children}
		</CurrentViewerProvider>
	);
}
