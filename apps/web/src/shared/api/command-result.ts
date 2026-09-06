import { ApiHttpError } from './api-client';

export type CommandResultSchema<TResult> = {
	safeParse(value: unknown): { data: TResult; success: true } | { success: false };
};

/**
 * Domain failures come back as 4xx responses whose body already is the command
 * result, so callers must receive them as a value: forms branch on `ok` to show
 * field errors, and a thrown error would skip that branch and the revalidation
 * that follows a submission. Anything the schema does not recognise stays thrown.
 */
export async function resolveCommandResult<TResult>(
	run: () => Promise<TResult>,
	schema: CommandResultSchema<TResult>
): Promise<TResult> {
	try {
		return await run();
	}
	catch (error: unknown) {
		if (error instanceof ApiHttpError) {
			const parsed = schema.safeParse(error.body);

			if (parsed.success) {
				return parsed.data;
			}
		}

		throw error;
	}
}
