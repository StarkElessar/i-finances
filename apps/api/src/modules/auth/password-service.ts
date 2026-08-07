import {
	hash,
	type Options,
	verify
} from '@node-rs/argon2';

const PASSWORD_OPTIONS = {
	algorithm: 2,
	version: 1,
	memoryCost: 19_456,
	timeCost: 2,
	parallelism: 1,
	outputLen: 32
} as const satisfies Options;

export class PasswordService {
	public hash(password: string): Promise<string> {
		return hash(password, PASSWORD_OPTIONS);
	}

	public verify(passwordHash: string, password: string): Promise<boolean> {
		return verify(passwordHash, password);
	}
}
