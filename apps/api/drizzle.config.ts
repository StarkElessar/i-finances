import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/infrastructure/database/schema/index.ts',
	out: './drizzle',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? './data/i-finances.sqlite'
	},
	strict: true,
	verbose: true
});
