/**
 * Returns active categories for external receipt classification services.
 */
export async function GET(): Promise<Response> {
	const { handlePublicCategoriesRequest } = await import('~/entities/category/api/public-categories.server');

	return handlePublicCategoriesRequest();
}

/**
 * Handles CORS preflight requests for the public categories endpoint.
 */
export async function OPTIONS(): Promise<Response> {
	const { handlePublicCategoriesOptionsRequest } = await import('~/entities/category/api/public-categories.server');

	return handlePublicCategoriesOptionsRequest();
}
