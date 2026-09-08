import { randomBytes } from 'node:crypto';

const apiKey = randomBytes(48).toString('base64url');

process.stdout.write(`${apiKey}\n`);
