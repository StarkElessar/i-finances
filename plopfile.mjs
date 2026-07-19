import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE_ROOT = 'src';
const ROUTES_ROOT = `${SOURCE_ROOT}/routes`;
const VIEWS_ROOT = `${SOURCE_ROOT}/views`;
const COMPONENT_TEMPLATE_DIR = 'tools/plop/templates/component';
const VIEW_TEMPLATE_DIR = 'tools/plop/templates/view';
const PLOP_FLAGS_WITH_VALUE = new Set(['--completion', '--cwd', '--dest', '--plopfile', '--preload']);
const PLOP_BOOLEAN_FLAGS = new Set(['--force', '--progress', '--show-type-names', '-f', '-t']);

export default function configurePlop(plop) {
    plop.setWelcomeMessage('Выберите генератор');

    plop.setGenerator('component', {
        description: 'Создать UI-компонент',
        prompts: async (inquirer) => {
            const cliOptions = parseCliOptions('component');
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
                templateFile: `${COMPONENT_TEMPLATE_DIR}/component.tsx.hbs`
            },
            {
                type: 'add',
                path: '{{targetDir}}/{{componentDirName}}/{{componentFileName}}.module.scss',
                skip: ({ includeCss }) => includeCss ? false : 'SCSS module skipped (--no-css)',
                templateFile: `${COMPONENT_TEMPLATE_DIR}/styles.module.scss.hbs`
            },
            {
                type: 'add',
                path: '{{targetDir}}/{{componentDirName}}/index.ts',
                templateFile: `${COMPONENT_TEMPLATE_DIR}/index.ts.hbs`
            }
        ]
    });

    plop.setGenerator('view', {
        description: 'Создать view и route-файл',
        prompts: async (inquirer) => {
            const cliOptions = parseCliOptions('view');
            const isCliNameProvided = Boolean(cliOptions.name);
            const name = cliOptions.name ?? await askViewName(inquirer);
            const viewBaseName = normalizeViewBaseName(name);
            const routeGroupInput = cliOptions.group ?? (isCliNameProvided ? '(app)' : await askRouteGroup(inquirer));
            const routePathInput = cliOptions.route ?? (isCliNameProvided ? toKebabCase(viewBaseName) : await askRoutePath(inquirer, viewBaseName));
            const routeGroup = normalizeRouteGroup(routeGroupInput);
            const routePath = normalizeRoutePath(routePathInput);
            await assertRouteGroupExists(routeGroup);
            const viewDirName = toKebabCase(viewBaseName);
            const routeComponentName = viewBaseName;
            const pageComponentName = `${viewBaseName}Page`;
            const pageTitle = humanizePascalCase(viewBaseName);
            const paths = buildViewScaffoldPaths({
                routeGroup,
                routePath,
                viewDirName
            });

            return {
                pageComponentName,
                pageTitle,
                routeComponentName,
                routeFilePath: paths.routeFilePath,
                routeGroup,
                routePath,
                styleFileName: `${viewDirName}.module.scss`,
                viewDirName,
                viewFilePath: paths.viewFilePath,
                viewImportPath: `~/views/${viewDirName}/page`,
                viewStyleFilePath: paths.viewStyleFilePath
            };
        },
        actions: [
            async (answers, _config, plop) => assertFilesDoNotExist(
                [
                    answers.routeFilePath,
                    answers.viewFilePath,
                    answers.viewStyleFilePath
                ],
                plop.getDestBasePath()
            ),
            {
                type: 'add',
                path: '{{viewFilePath}}',
                templateFile: `${VIEW_TEMPLATE_DIR}/page.tsx.hbs`
            },
            {
                type: 'add',
                path: '{{viewStyleFilePath}}',
                templateFile: `${VIEW_TEMPLATE_DIR}/styles.module.scss.hbs`
            },
            {
                type: 'add',
                path: '{{routeFilePath}}',
                templateFile: `${VIEW_TEMPLATE_DIR}/route.tsx.hbs`
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

async function askViewName(inquirer) {
    const { name } = await inquirer.prompt([
        {
            message: 'Имя вьюшки в PascalCase, без Page',
            name: 'name',
            type: 'input',
            validate: validateViewName
        }
    ]);

    return name;
}

async function askRouteGroup(inquirer) {
    const routeGroups = await readRouteGroups();
    const { routeGroup } = await inquirer.prompt([
        {
            choices: routeGroups.map((group) => ({
                name: group,
                value: group
            })),
            default: routeGroups.includes('(app)') ? '(app)' : routeGroups[0],
            message: 'Route group',
            name: 'routeGroup',
            type: 'list'
        }
    ]);

    return routeGroup;
}

async function askRoutePath(inquirer, viewBaseName) {
    const { routePath } = await inquirer.prompt([
        {
            default: toKebabCase(viewBaseName),
            message: 'Route path без ведущего слеша',
            name: 'routePath',
            type: 'input',
            validate: validateRoutePath
        }
    ]);

    return routePath;
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

async function readRouteGroups() {
    const entries = await fs.readdir(path.resolve(process.cwd(), ROUTES_ROOT), { withFileTypes: true });
    const routeGroups = entries
        .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((first, second) => first.localeCompare(second));

    if (routeGroups.length === 0) {
        throw new Error(`Не нашел route group директорий в ${ROUTES_ROOT}`);
    }

    return routeGroups;
}

function parseCliOptions(generatorName) {
    const args = process.argv.slice(findGeneratorArgIndex(generatorName) + 1);
    const positionals = [];
    const options = {
        group: undefined,
        includeCss: true,
        includeType: true,
        name: undefined,
        path: undefined,
        route: undefined
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

        if (arg === '--route') {
            options.route = args[index + 1];
            index += 1;
            continue;
        }

        if (arg.startsWith('--route=')) {
            options.route = arg.slice('--route='.length);
            continue;
        }

        if (arg === '--group') {
            options.group = args[index + 1];
            index += 1;
            continue;
        }

        if (arg.startsWith('--group=')) {
            options.group = arg.slice('--group='.length);
            continue;
        }

        if (arg === '--auth') {
            options.group = '(auth)';
            continue;
        }

        if (arg === '--app') {
            options.group = '(app)';
            continue;
        }

        if (!arg.startsWith('-')) {
            positionals.push(arg);
        }
    }

    options.name ??= positionals[0];
    options.path ??= positionals[1];
    options.route ??= positionals[1];

    return options;
}

function findGeneratorArgIndex(generatorName) {
    const generatorIndex = process.argv.findIndex((arg) => arg === generatorName);

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

function normalizeViewBaseName(name) {
    const normalizedName = name?.trim().replace(/Page$/, '');
    const validationResult = validateViewName(normalizedName);

    if (validationResult !== true) {
        throw new Error(validationResult);
    }

    return normalizedName;
}

function normalizeRouteGroup(routeGroup) {
    const normalizedInput = routeGroup?.trim();

    if (!normalizedInput) {
        return '(app)';
    }

    if (/^\(.+\)$/.test(normalizedInput)) {
        return normalizedInput;
    }

    if (/^[a-z][a-z0-9-]*$/.test(normalizedInput)) {
        return `(${normalizedInput})`;
    }

    throw new Error('Route group должен быть вроде app, auth, (app) или (auth)');
}

function normalizeRoutePath(routePath) {
    const normalizedInput = routePath
        ?.trim()
        .replaceAll('\\', '/')
        .replace(/\.tsx$/, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    const validationResult = validateRoutePath(normalizedInput);

    if (validationResult !== true) {
        throw new Error(validationResult);
    }

    if (!normalizedInput || normalizedInput === '.') {
        return 'index';
    }

    return path.posix.normalize(normalizedInput);
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

function validateViewName(name) {
    const normalizedName = name?.trim().replace(/Page$/, '');

    if (!normalizedName) {
        return 'Укажите имя вьюшки';
    }

    if (!/^[A-Z][A-Za-z0-9]*$/.test(normalizedName)) {
        return 'Имя вьюшки должно быть в PascalCase, например CashFlow';
    }

    return true;
}

function validateRoutePath(routePath) {
    if (routePath === undefined || routePath === null) {
        return 'Укажите route path';
    }

    const normalizedPath = routePath
        .trim()
        .replaceAll('\\', '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');

    if (!normalizedPath || normalizedPath === '.') {
        return true;
    }

    if (path.isAbsolute(routePath)) {
        return 'Route path должен быть относительным';
    }

    if (normalizedPath === '..' || normalizedPath.startsWith('../') || normalizedPath.includes('/../')) {
        return 'Route path не должен выходить за пределы route group';
    }

    if (normalizedPath.includes('//')) {
        return 'Route path не должен содержать пустые сегменты';
    }

    if (!/^[a-z0-9._\-[\]/]+$/.test(normalizedPath)) {
        return 'Route path может содержать строчные буквы, цифры, -, _, ., / и dynamic segments в []';
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

function humanizePascalCase(value) {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

function buildViewScaffoldPaths({ routeGroup, routePath, viewDirName }) {
    return {
        routeFilePath: path.posix.join(ROUTES_ROOT, routeGroup, `${routePath}.tsx`),
        viewFilePath: path.posix.join(VIEWS_ROOT, viewDirName, 'page.tsx'),
        viewStyleFilePath: path.posix.join(VIEWS_ROOT, viewDirName, `${viewDirName}.module.scss`)
    };
}

async function assertRouteGroupExists(routeGroup) {
    const routeGroupPath = path.posix.join(ROUTES_ROOT, routeGroup);

    if (await pathExists(routeGroupPath, process.cwd())) {
        return;
    }

    throw new Error(`Route group ${routeGroup} не существует в ${ROUTES_ROOT}`);
}

async function assertFilesDoNotExist(filePaths, basePath = process.cwd()) {
    const existingPaths = [];

    for (const filePath of filePaths) {
        if (await pathExists(filePath, basePath)) {
            existingPaths.push(filePath);
        }
    }

    if (existingPaths.length > 0) {
        throw new Error(`Файлы уже существуют: ${existingPaths.join(', ')}`);
    }

    return 'target files are free';
}

async function pathExists(filePath, basePath) {
    try {
        await fs.access(path.resolve(basePath, filePath));
        return true;
    }
    catch {
        return false;
    }
}
