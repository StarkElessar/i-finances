import { query } from '@solidjs/router';

import type { CurrentViewer } from '~/entities/viewer/model/types';

/**
 * Reads the current authenticated user snapshot on the server.
 */
async function readCurrentViewer(): Promise<CurrentViewer | null> {
	'use server';

	const { getCurrentSession } = await import('~/server/auth/require-user');
	const session = await getCurrentSession();

	return session?.user ?? null;
}

export const getCurrentViewer = query(readCurrentViewer, 'current-viewer');
