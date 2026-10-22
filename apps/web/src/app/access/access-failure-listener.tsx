import { subscribeToApiAccessFailures } from '@/shared/api';

import { householdLossNotice, useClearCurrentViewer, useCurrentViewer, useSetCurrentViewer } from '@/entities/viewer';

import { query } from '@solidjs/router';
import { onCleanup, onMount } from 'solid-js';

import { applyAccessFailure } from './apply-access-failure';

/**
 * Listens to access failures of every API request (401, 403 `household-required`) and patches the viewer snapshot,
 * which the route guards follow. Renders nothing.
 */
export function AccessFailureListener() {
	const viewer = useCurrentViewer();
	const setCurrentViewer = useSetCurrentViewer();
	const clearCurrentViewer = useClearCurrentViewer();

	onMount(() => {
		const unsubscribe = subscribeToApiAccessFailures((failure) => {
			applyAccessFailure(failure, viewer(), {
				clearCache: () => query.clear(),
				clearCurrentViewer,
				rememberLostHousehold: (userId, householdName) => householdLossNotice.save(userId, householdName),
				setCurrentViewer
			});
		});

		onCleanup(unsubscribe);
	});

	return null;
}
