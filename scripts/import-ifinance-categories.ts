import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { and, eq } from 'drizzle-orm';

import {
    CATEGORY_ICON_SEED_BY_NORMALIZED_NAME,
    DEFAULT_CATEGORY_ICON_ID,
    normalizeCategoryIdentity,
    normalizeCategoryKeyword,
    normalizeCategoryName
} from '../src/entities/category';
import { db, sqlite } from '../src/server/db/client';
import {
    categories,
    categoryKeywords,
    householdMembers,
    users
} from '../src/server/db/schema';

type CliOptions = {
    apply: boolean;
    file: string;
    username?: string;
};

type ImportedCategory = {
    color: string;
    flatName: string;
    keywords: string[];
    name: string;
};

const DEFAULT_IMPORT_FILE = 'public/iFinance категории.ifi3cat';
const ALLOWED_OPTIONS = new Set(['apply', 'dry-run', 'file', 'username']);

function parseCliOptions(arguments_: readonly string[]): CliOptions {
    const normalizedArguments = arguments_[0] === '--'
        ? arguments_.slice(1)
        : arguments_;
    const options: CliOptions = {
        apply: false,
        file: DEFAULT_IMPORT_FILE
    };

    for (let index = 0; index < normalizedArguments.length; index += 1) {
        const option = normalizedArguments[index];

        if (!option.startsWith('--')) {
            throw new Error(`Unexpected positional argument: ${option}.`);
        }

        const name = option.slice(2);

        if (!ALLOWED_OPTIONS.has(name)) {
            throw new Error(`Unknown option: --${name}.`);
        }

        if (name === 'apply') {
            options.apply = true;
            continue;
        }

        if (name === 'dry-run') {
            options.apply = false;
            continue;
        }

        const value = normalizedArguments[index + 1];

        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Option --${name} requires a value.`);
        }

        if (name === 'file') {
            options.file = value;
        }

        if (name === 'username') {
            options.username = value;
        }

        index += 1;
    }

    return options;
}

function decodeXmlText(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function colorPartToHex(value: string | null): string {
    const byte = Math.max(0, Math.min(255, Math.round(Number(value ?? 0) * 255)));

    return byte.toString(16).padStart(2, '0');
}

function toHexColor(red: string | null, green: string | null, blue: string | null): string {
    return `#${colorPartToHex(red)}${colorPartToHex(green)}${colorPartToHex(blue)}`;
}

function parseKeywordTokens(value: string): string[] {
    const tokens: string[] = [];
    const pattern = /"([^"]+)"|(\S+)/g;

    for (const match of value.matchAll(pattern)) {
        tokens.push(match[1] ?? match[2]);
    }

    const uniqueTokens = new Map<string, string>();

    tokens
        .map(normalizeCategoryKeyword)
        .filter((token) => token.length > 0)
        .forEach((token) => {
            uniqueTokens.set(normalizeCategoryIdentity(token), token);
        });

    return [...uniqueTokens.values()];
}

function parseIFinanceCategories(filePath: string): ImportedCategory[] {
    const xml = readFileSync(filePath, 'utf8');
    const stack: Array<{
        blue: string | null;
        green: string | null;
        keywords: string;
        name: string;
        red: string | null;
    }> = [];
    const parsedCategories: ImportedCategory[] = [];

    for (const rawLine of xml.split(/\r?\n/)) {
        const line = rawLine.trim();
        const openCategoryMatch = /^<category name="([^"]*)">$/.exec(line);

        if (openCategoryMatch !== null) {
            stack.push({
                blue: null,
                green: null,
                keywords: '',
                name: normalizeCategoryName(decodeXmlText(openCategoryMatch[1])),
                red: null
            });
            continue;
        }

        if (line === '</category>') {
            const category = stack.pop();

            if (category !== undefined) {
                const flatName = [...stack.map((item) => item.name), category.name]
                    .join(':');

                parsedCategories.push({
                    color: toHexColor(category.red, category.green, category.blue),
                    flatName,
                    keywords: parseKeywordTokens(category.keywords),
                    name: category.name
                });
            }

            continue;
        }

        const fieldMatch = /^<(color_red|color_green|color_blue|keywords)>(.*)<\/\1>$/.exec(line);

        if (fieldMatch === null || stack.length === 0) {
            continue;
        }

        const category = stack.at(-1);

        if (category === undefined) {
            continue;
        }

        const [, field, value] = fieldMatch;

        if (field === 'color_red') {
            category.red = value;
        }

        if (field === 'color_green') {
            category.green = value;
        }

        if (field === 'color_blue') {
            category.blue = value;
        }

        if (field === 'keywords') {
            category.keywords = decodeXmlText(value);
        }
    }

    if (stack.length > 0) {
        throw new Error('Malformed category XML: some categories were not closed.');
    }

    return deduplicateCategories(parsedCategories);
}

function deduplicateCategories(
    importedCategories: readonly ImportedCategory[]
): ImportedCategory[] {
    const categoriesByIdentity = new Map<string, ImportedCategory>();

    importedCategories.forEach((category) => {
        const identity = normalizeCategoryIdentity(category.name);

        if (categoriesByIdentity.has(identity)) {
            const existingCategory = categoriesByIdentity.get(identity);

            throw new Error(
                `Flattened category name conflict: "${existingCategory?.flatName}" and "${category.flatName}".`
            );
        }

        categoriesByIdentity.set(identity, category);
    });

    return [...categoriesByIdentity.values()];
}

function createKeywordRows(categoryId: string, keywords: readonly string[]) {
    return keywords.map((keyword, position) => ({
        categoryId,
        normalizedValue: normalizeCategoryIdentity(keyword),
        position,
        value: keyword
    }));
}

function getImportUser(username?: string) {
    const selectedUsers = db.select({
        householdId: householdMembers.householdId,
        userId: users.id,
        username: users.username
    })
        .from(users)
        .innerJoin(householdMembers, eq(householdMembers.userId, users.id))
        .where(username === undefined ? undefined : eq(users.username, username))
        .limit(2)
        .all();

    if (selectedUsers.length === 0) {
        throw new Error(
            username === undefined
                ? 'No household member was found for category import.'
                : `User "${username}" does not belong to a household.`
        );
    }

    if (selectedUsers.length > 1) {
        throw new Error('Several household users match the import input. Pass --username.');
    }

    return selectedUsers[0];
}

function getExistingCategoryIdentities(householdId: string): Set<string> {
    const rows = db.select({ normalizedName: categories.normalizedName })
        .from(categories)
        .where(eq(categories.householdId, householdId))
        .all();

    return new Set(rows.map((row) => row.normalizedName));
}

function importCategories(options: CliOptions): void {
    const importUser = getImportUser(options.username);
    const filePath = resolve(options.file);
    const importedCategories = parseIFinanceCategories(filePath);
    const existingIdentities = getExistingCategoryIdentities(importUser.householdId);
    const categoriesToCreate = importedCategories.filter((category) => {
        return !existingIdentities.has(normalizeCategoryIdentity(category.name));
    });
    const skippedCategories = importedCategories.filter((category) => {
        return existingIdentities.has(normalizeCategoryIdentity(category.name));
    });

    console.warn(`Parsed ${importedCategories.length} categories from "${filePath}".`);
    console.warn(`Existing categories skipped: ${skippedCategories.length}.`);
    console.warn(`Categories to create: ${categoriesToCreate.length}.`);

    if (skippedCategories.length > 0) {
        console.warn(
            `Skipped: ${skippedCategories.map((category) => category.name).join(', ')}.`
        );
    }

    if (!options.apply) {
        console.warn('Dry-run only. Pass --apply to write categories.');
        return;
    }

    const timestamp = new Date();

    db.transaction((transaction) => {
        categoriesToCreate.forEach((category) => {
            const categoryId = randomUUID();
            const normalizedName = normalizeCategoryIdentity(category.name);
            const seededIcon = Object.hasOwn(CATEGORY_ICON_SEED_BY_NORMALIZED_NAME, normalizedName)
                ? CATEGORY_ICON_SEED_BY_NORMALIZED_NAME[
                    normalizedName as keyof typeof CATEGORY_ICON_SEED_BY_NORMALIZED_NAME
                ]
                : DEFAULT_CATEGORY_ICON_ID;

            transaction.insert(categories)
                .values({
                    archivedAt: null,
                    color: category.color,
                    createdAt: timestamp,
                    createdByUserId: importUser.userId,
                    householdId: importUser.householdId,
                    icon: seededIcon,
                    id: categoryId,
                    monthlyBudgetMinor: null,
                    name: category.name,
                    normalizedName,
                    updatedAt: timestamp,
                    version: 1
                })
                .run();

            const keywordRows = createKeywordRows(categoryId, category.keywords);

            if (keywordRows.length > 0) {
                transaction.insert(categoryKeywords)
                    .values(keywordRows)
                    .run();
            }
        });
    });

    console.warn(`Imported ${categoriesToCreate.length} categories.`);
}

try {
    importCategories(parseCliOptions(process.argv.slice(2)));
}
catch (error: unknown) {
    console.error('Failed to import iFinance categories.', error);
    process.exitCode = 1;
}
finally {
    sqlite.close();
}
