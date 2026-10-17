/**
 * A valid Argon2id hash of a random, discarded password, made with the same cost parameters as `PasswordService`.
 * Verifying against it takes as long as verifying a real password, which keeps the response time of unknown users,
 * inactive users and accounts without a password indistinguishable from a wrong password. It matches nothing.
 *
 * Regenerate it together with the cost parameters in `password-service.ts`.
 */
export const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$0WJgSvGizxUHICJFbpiSoA$/OmkqVdG9qB9KRp1Zm4iFhyyZJvhAiCtZp9sNChTYu8';
