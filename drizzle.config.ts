import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'sqlite',
    schema: './src/server/db/schema/index.ts',
    out: './drizzle',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? './data/i-finances.sqlite'
    },
    strict: true,
    verbose: true
});
