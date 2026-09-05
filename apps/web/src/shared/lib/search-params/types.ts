/**
 * Raw query bag as exposed by routers (`string` or repeated keys as `string[]`).
 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Flat query patch for router setters (`undefined` removes the key).
 */
export type SerializedSearchParams = Record<string, string | undefined>;
