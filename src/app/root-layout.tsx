import { Meta, MetaProvider, Title } from '@solidjs/meta';
import type { RouteSectionProps } from '@solidjs/router';
import { Suspense } from 'solid-js';

/**
 * Provides document metadata and suspense boundaries shared by every route.
 */
export function RootLayout(props: RouteSectionProps) {
	return (
		<MetaProvider>
			<Title>iFinances</Title>
			<Meta content='width=device-width, initial-scale=1' name='viewport'/>
			<Suspense>
				{props.children}
			</Suspense>
		</MetaProvider>
	);
}
