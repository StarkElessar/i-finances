/**
 * Produces the canonical operation title stored by the server.
 */
export function normalizeOperationTitle(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

/**
 * Produces the canonical optional operation comment.
 */
export function normalizeOperationComment(value: string): string {
	return value.trim();
}
