export {
	type AuthConfig,
	getAuthConfig
} from './auth-config';
export { choosePasskeyUserName } from './choose-passkey-user-name';
export { DUMMY_PASSWORD_HASH } from './dummy-password-hash';
export {
	FixedWindowRateLimiter,
	type FixedWindowRateLimiterOptions,
	type FixedWindowRateLimitResult
} from './fixed-window-rate-limiter';
export { hasUsablePassword } from './has-usable-password';
export {
	LoginRateLimiter,
	type LoginRateLimiterOptions,
	type LoginRateLimitInput,
	type LoginRateLimitResult
} from './login-rate-limiter';
export { normalizeUsername } from './normalize-username';
export {
	type ParsedUserAgent,
	parseUserAgent
} from './parse-user-agent';
export {
	base64UrlToUint8Array,
	uint8ArrayToBase64Url
} from './passkey-encoding';
export { PasswordService } from './password-service';
export {
	type LoginRateLimitPort,
	type PasswordSignInMetadata,
	type PasswordSignInOutcome,
	PasswordSignInService,
	type PasswordSignInServiceDependencies,
	type PasswordUserPort,
	type PasswordVerificationPort,
	type SessionCreationPort
} from './password-sign-in-service';
export {
	type PasswordAuthUserRecord,
	type PasswordReplacement,
	PasswordUserRepository,
	type ReplacePasswordInput
} from './password-user-repository';
export { isReservedUsername, TELEGRAM_USERNAME_PREFIX } from './reserved-username';
export {
	type ChangePasswordOutcome,
	type RotatedSession,
	type SecurityActor,
	SecurityService,
	type SecurityServiceDependencies
} from './security-service';
export {
	type SessionInsertRecord,
	SessionRepository,
	type SessionStatementExecutor,
	type SessionSummaryRecord,
	type SessionWithUserRecord
} from './session-repository';
export {
	type AuthenticatedSession,
	type CreatedSession,
	generateSessionToken,
	hashSessionToken,
	type SessionMetadata,
	SessionService,
	type SessionServiceOptions,
	type SessionUser
} from './session-service';
export {
	type SignInMethods,
	type SignInMethodsPort,
	SignInMethodsRepository
} from './sign-in-methods-repository';
export {
	type ConsumeWebAuthnChallengeInput,
	type WebAuthnChallengeInsertRecord,
	WebAuthnChallengeRepository
} from './webauthn-challenge-repository';
export {
	type WebAuthnCredential,
	type WebAuthnCredentialInsert,
	WebAuthnCredentialRepository,
	type WebAuthnCredentialUsage,
	type WebAuthnCredentialWithUser
} from './webauthn-credential-repository';
export {
	type PasskeyRequestMetadata,
	type PasskeySignInOutcome,
	WebAuthnService,
	type WebAuthnServiceDependencies
} from './webauthn-service';
