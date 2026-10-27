import {
	updateDisplayNameErrorMessageByCode,
	updateDisplayNameInputSchema,
	type UpdateDisplayNameResult
} from '@i-finances/contracts';

export type DisplayNameGateway = {
	updateDisplayName: (displayName: string) => Promise<UpdateDisplayNameResult>;
};

export type SaveDisplayNameOutcome =
	| { displayName: string; kind: 'saved' }
	| { kind: 'invalid-name'; message: string }
	| { kind: 'failed'; message: string };

/** Confirms a name before joining or creating a household. A failure must stop the following household action. */
export async function saveDisplayName(
	gateway: DisplayNameGateway,
	displayName: string,
	currentName: string | undefined
): Promise<SaveDisplayNameOutcome> {
	const parsed = updateDisplayNameInputSchema.safeParse({ displayName });

	if (!parsed.success) {
		return { kind: 'invalid-name', message: parsed.error.issues[0]?.message ?? updateDisplayNameErrorMessageByCode['invalid-input'] };
	}

	if (parsed.data.displayName === currentName) {
		return { displayName: parsed.data.displayName, kind: 'saved' };
	}

	try {
		const result = await gateway.updateDisplayName(parsed.data.displayName);

		return result.ok ? { displayName: result.displayName, kind: 'saved' } : { kind: 'failed', message: result.message };
	}
	catch {
		return { kind: 'failed', message: updateDisplayNameErrorMessageByCode.unexpected };
	}
}
