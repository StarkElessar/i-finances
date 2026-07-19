import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE_ROOT = 'src';
const TEMPLATE_DIR = 'tools/plop/templates/component';
const PLOP_FLAGS_WITH_VALUE = new Set(['--completion', '--cwd', '--dest', '--plopfile', '--preload']);
const PLOP_BOOLEAN_FLAGS = new Set(['--force', '--progress', '--show-type-names', '-f', '-t']);

export default function configurePlop(plop) {
    plop.setWelcomeMessage('Выберите генератор');

    plop.setGenerator('component', {
        description: 'Создать UI-компонент',
        prompts: async (inquirer) => {
            const cliOptions = parseCliOptions();
            const name = cliOptions.name ?? await askComponentName(inquirer);
            const componentName = normalizeComponentName(name);
            const targetDir = normalizeTargetDir(cliOptions.path ?? await selectTargetDir(inquirer));
            const componentFileName = toKebabCase(componentName);

            return {
                componentDirName: componentFileName,
                componentFileName,
                componentName,
                includeCss: cliOptions.includeCss,
                includeType: cliOptions.includeType,
                targetDir
            };
        },
        actions: [
            {
                type: 'add',
                path: '{{targetDir}}/{{componentDirName}}/{{componentFileName}}.tsx',
                templateFile: `${TEMPLATE_DIR}/component.tsx.hbs`
            },
            {
                type: 'add',
                path: '{{targetDir}}/{{componentDirName}}/{{componentFileName}}.module.scss',
                skip: ({ includeCss }) => includeCss ? false : 'SCSS module skipped (--no-css)',
                templateFile: `${TEMPLATE_DIR}/styles.module.scss.hbs`
            },
            {
                type: 'add',
                path: '{{targetDir}}/{{componentDirName}}/index.ts',
                templateFile: `${TEMPLATE_DIR}/index.ts.hbs`
            }
        ]
    });
}

async function askComponentName(inquirer) {
    const { name } = await inquirer.prompt([
        {
            message: 'Имя компонента в PascalCase',
            name: 'name',
            type: 'input',
            validate: validateComponentName
        }
    ]);

    return name;
}

async function selectTargetDir(inquirer) {
    let currentDir = SOURCE_ROOT;

    while (true) {
        const childDirs = await readChildDirs(currentDir);
        const choices = [
            {
                name: `Создать здесь: ${currentDir}`,
                value: { type: 'select-current' }
            },
            ...childDirs.map((dirName) => ({
                name: `${dirName}/`,
                value: { dirName, type: 'enter-dir' }
            })),
            {
                name: 'Ввести путь вручную',
                value: { type: 'manual' }
            }
        ];

        if (currentDir !== SOURCE_ROOT) {
            choices.splice(1, 0, {
                name: '../',
                value: { type: 'go-up' }
            });
        }

        const { action } = await inquirer.prompt([
            {
                choices,
                message: `Папка назначения: ${currentDir}`,
                name: 'action',
                pageSize: 20,
                type: 'list'
            }
        ]);

        if (action.type === 'select-current') {
            return currentDir;
        }

        if (action.type === 'manual') {
            return askTargetDir(inquirer);
        }

        if (action.type === 'go-up') {
            currentDir = path.posix.dirname(currentDir);
            continue;
        }

        currentDir = path.posix.join(currentDir, action.dirName);
    }
}

async function askTargetDir(inquirer) {
    const { targetDir } = await inquirer.prompt([
        {
            default: SOURCE_ROOT,
            message: 'Папка, внутри которой создать компонент',
            name: 'targetDir',
            type: 'input',
            validate: validateTargetDir
        }
    ]);

    return targetDir;
}

async function readChildDirs(relativeDir) {
    const absoluteDir = path.resolve(process.cwd(), relativeDir);
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

    return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort((first, second) => first.localeCompare(second));
}

function parseCliOptions() {
    const args = process.argv.slice(findGeneratorArgIndex() + 1);
    const positionals = [];
    const options = {
        includeCss: true,
        includeType: true,
        name: undefined,
        path: undefined
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === '--') {
            continue;
        }

        if (PLOP_FLAGS_WITH_VALUE.has(arg)) {
            index += 1;
            continue;
        }

        if ([...PLOP_FLAGS_WITH_VALUE].some((flagName) => arg.startsWith(`${flagName}=`))) {
            continue;
        }

        if (PLOP_BOOLEAN_FLAGS.has(arg)) {
            continue;
        }

        if (arg === '--no-css') {
            options.includeCss = false;
            continue;
        }

        if (arg === '--css') {
            options.includeCss = true;
            continue;
        }

        if (arg === '--no-type' || arg === '--no-types') {
            options.includeType = false;
            continue;
        }

        if (arg === '--type' || arg === '--types') {
            options.includeType = true;
            continue;
        }

        if (arg === '--name') {
            options.name = args[index + 1];
            index += 1;
            continue;
        }

        if (arg.startsWith('--name=')) {
            options.name = arg.slice('--name='.length);
            continue;
        }

        if (arg === '--path' || arg === '--dir') {
            options.path = args[index + 1];
            index += 1;
            continue;
        }

        if (arg.startsWith('--path=')) {
            options.path = arg.slice('--path='.length);
            continue;
        }

        if (arg.startsWith('--dir=')) {
            options.path = arg.slice('--dir='.length);
            continue;
        }

        if (!arg.startsWith('-')) {
            positionals.push(arg);
        }
    }

    options.name ??= positionals[0];
    options.path ??= positionals[1];

    return options;
}

function findGeneratorArgIndex() {
    const generatorIndex = process.argv.findIndex((arg) => arg === 'component');

    return generatorIndex === -1 ? process.argv.length - 1 : generatorIndex;
}

function normalizeComponentName(name) {
    const normalizedName = name?.trim();
    const validationResult = validateComponentName(normalizedName);

    if (validationResult !== true) {
        throw new Error(validationResult);
    }

    return normalizedName;
}

function normalizeTargetDir(targetDir) {
    const normalizedInput = targetDir
        ?.trim()
        .replaceAll('\\', '/')
        .replace(/\/+$/, '');
    const validationResult = validateTargetDir(normalizedInput);

    if (validationResult !== true) {
        throw new Error(validationResult);
    }

    if (normalizedInput === SOURCE_ROOT || normalizedInput.startsWith(`${SOURCE_ROOT}/`)) {
        return path.posix.normalize(normalizedInput);
    }

    return path.posix.normalize(`${SOURCE_ROOT}/${normalizedInput}`);
}

function validateComponentName(name) {
    if (!name) {
        return 'Укажите имя компонента';
    }

    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
        return 'Имя компонента должно быть в PascalCase, например BrandPanel';
    }

    return true;
}

function validateTargetDir(targetDir) {
    if (!targetDir) {
        return 'Укажите папку назначения';
    }

    if (path.isAbsolute(targetDir)) {
        return 'Используйте путь относительно корня проекта';
    }

    const normalizedPath = path.posix.normalize(targetDir.replaceAll('\\', '/'));

    if (normalizedPath === '..' || normalizedPath.startsWith('../')) {
        return 'Путь не должен выходить за пределы проекта';
    }

    if (normalizedPath === SOURCE_ROOT || normalizedPath.startsWith(`${SOURCE_ROOT}/`)) {
        return true;
    }

    if (!normalizedPath.startsWith('../')) {
        return true;
    }

    return 'Путь должен быть внутри src';
}

function toKebabCase(value) {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
