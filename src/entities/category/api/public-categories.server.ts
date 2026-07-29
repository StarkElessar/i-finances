import { toPersistedCategory } from '~/server/category/category-mappers';
import {
    type CategoryAggregateRecord,
    type CategoryRepository,
    createCategoryRepository
} from '~/server/category/category-repository';
import { DEFAULT_HOUSEHOLD_ID } from '~/server/household/default-household';

export type PublicCategory = {
    color: string;
    id: string;
    keywords: string[];
    name: string;
};

export type PublicCategoriesRequestDependencies = {
    categoryRepository?: Pick<CategoryRepository, 'list'>;
    householdId?: string;
};

const CORS_HEADERS = {
    'access-control-allow-origin': '*'
} as const;

const JSON_HEADERS = {
    ...CORS_HEADERS,
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8'
} as const;

/**
 * Sends a serializable JSON response for unauthenticated public integrations.
 */
function createJsonResponse(body: unknown, statusCode = 200): Response {
    return new Response(JSON.stringify(body), {
        status: statusCode,
        headers: JSON_HEADERS
    });
}

/**
 * Converts internal category persistence data to the public matching contract.
 */
function toPublicCategory(record: CategoryAggregateRecord): PublicCategory {
    const category = toPersistedCategory(record);

    return {
        color: category.color,
        id: category.id,
        keywords: category.keywords,
        name: category.name
    };
}

/**
 * Returns active default-household categories without requiring a user session.
 */
export async function handlePublicCategoriesRequest(
    dependencies: PublicCategoriesRequestDependencies = {}
): Promise<Response> {
    const categoryRepository = dependencies.categoryRepository ?? createCategoryRepository();
    const householdId = dependencies.householdId ?? DEFAULT_HOUSEHOLD_ID;
    const records = await categoryRepository.list(householdId, 'active');

    return createJsonResponse(records.map(toPublicCategory));
}

/**
 * Allows browser-based integrations to call the public categories endpoint.
 */
export function handlePublicCategoriesOptionsRequest(): Response {
    return new Response(null, {
        status: 204,
        headers: {
            ...CORS_HEADERS,
            'access-control-allow-headers': 'accept, content-type',
            'access-control-allow-methods': 'GET, OPTIONS',
            'access-control-max-age': '86400'
        }
    });
}
