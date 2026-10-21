/** A contract failure body of a Telegram request, whatever the kind of request. */
export type TelegramRequestFailure = {
	errorCode: string;
	message: string;
	retryAfterSeconds?: number;
};

export type TelegramRequestStartAnswer =
	| { appUrl: string; botUrl: string; code: string; expiresAt: string; ok: true }
	| { errorCode: string; message: string; ok: false };

export type TelegramRequestCompleteAnswer<TConfirmed extends object> =
	| { ok: true; status: 'pending' }
	| { confirmed: TConfirmed; ok: true; status: 'confirmed' }
	| { errorCode: string; message: string; ok: false };

/** How the flow treats a failure code; the rest of the codes are final failures shown to the person. */
export type TelegramRequestFailureKind =
	/** The request was started by another browser, or its cookie is gone. */
	| 'browser-mismatch'
	/** 410: the request ran out (or was used up). */
	| 'expired'
	/** 429: wait, do not hammer. */
	| 'rate-limited'
	/** 404: Telegram is switched off on the server. */
	| 'unavailable'
	/** A failure that says nothing about the request (500, `unexpected`): keep asking. */
	| 'transient'
	| 'other';

/**
 * What differs between the sign-in and the link: the three requests, how their failures are read and worded, and how a
 * confirmation whose answer was lost is found. Everything else (timers, polling, the cookie order) is the flow's.
 */
export type TelegramRequestProtocol<TConfirmed extends object, TReason extends string> = {
	cancel(code: string): Promise<unknown>;
	classify(errorCode: string): TelegramRequestFailureKind;
	complete(code: string): Promise<TelegramRequestCompleteAnswer<TConfirmed>>;
	/** The code the server answers (410) when the request ran out; the flow uses it when the deadline passes on its own clock. */
	expiredErrorCode: string;
	messages: {
		expired: string;
		unexpected: string;
	};
	/** A contract failure body, or `null` for anything else: no network, a proxy page, a body the contract does not know. */
	readFailure(error: unknown): TelegramRequestFailure | null;
	/** The reason shown for a failure code; `unexpected` for a code the board has no picture for. */
	reasonOf(errorCode: string): TReason | 'unexpected';
	/** Read only when a confirmation may have been lost on the way: the confirmed value if the server shows it, else `undefined`. */
	recoverConfirmation(): Promise<TConfirmed | undefined>;
	start(): Promise<TelegramRequestStartAnswer>;
};
