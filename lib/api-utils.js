"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs_1 = require("fs");
const path_1 = require("path");
const util_1 = require("util");
const readFileAsync = (0, util_1.promisify)(fs_1.readFile);
const writeFileAsync = (0, util_1.promisify)(fs_1.writeFile);
const API_ENDPOINT = 'https://www.plurk.com/API/2/list';
const WRITE_PATH = (0, path_1.join)(__dirname, '../src/api-parameters.ts');
const isTruthy = Boolean;
function mapValues(val) {
    switch (val.trim()) {
        case 'true':
        case 'false':
        case 'null':
            return val;
        case 'PID':
            return 'number';
        default:
            if (Number.isFinite(Number.parseFloat(val)))
                return val;
            return `'${escapeUnsaveCharacters(val)}'`;
    }
}
const unsafeCharacters = /[\0\n\f\n\r\t\v\\'"]/mg;
function escapeUnsaveCharacters(str) {
    return str.replace(unsafeCharacters, escapeUnsaveCharactersMap);
}
function escapeUnsaveCharactersMap(src) {
    switch (src) {
        case '\r': return '\\r';
        case '\n': return '\\n';
        case '\b': return '\\b';
        case '\t': return '\\t';
        case '\v': return '\\v';
        case '\0': return '\\0';
        case '\\': return '\\\\';
        case '\'': return '\\\'';
        case '\"': return '\\\"';
    }
    return src;
}
function processOptions(options, defaultValue) {
    if (options)
        return options.split('|').map(mapValues).filter(isTruthy).join(' | ');
    if (!defaultValue)
        return 'any';
    switch (defaultValue.trim()) {
        case 'true':
        case 'false':
            return 'boolean';
        case 'null':
        case 'n/a':
            return 'any';
        case '[]':
            return 'any[]';
        default:
            if (Number.isFinite(Number.parseFloat(defaultValue)))
                return 'number';
            return 'string';
    }
}
function toCapitalize(str) {
    return str.length ? str.charAt(0).toUpperCase() + str.substring(1) : str;
}
const colMatcher = /^(\w+)(?:=([^\|:]+(?:\|[^\|:]+)*))?(?:\:(.+))?$/;
function dropOptionsToNamespaces(namespaces, path, data) {
    let pathIdx = path.indexOf('/');
    if (pathIdx >= 0) {
        const ns = toCapitalize(path.substring(0, pathIdx));
        let child = namespaces.get(ns);
        if (!child) {
            child = new Map();
            namespaces.set(ns, child);
        }
        return `${ns}.${dropOptionsToNamespaces(child, path.substring(pathIdx + 1), data)}`;
    }
    else {
        const results = [];
        for (const type of data) {
            const m = colMatcher.exec(type);
            if (!m) {
                console.error('WARN: %m does not matches the regexp.', type);
                continue;
            }
            const [, param, options, defaultValue] = m;
            results.push(`${param}${defaultValue ? '?' : ''}: ${processOptions(options, defaultValue)};`);
        }
        const ns = `${toCapitalize(path)}Options`;
        namespaces.set(ns, results);
        return ns;
    }
}
function printNamespaces(out, namespaces, indent = '') {
    let isFirst = true;
    for (const [name, data] of namespaces) {
        if (!isFirst)
            out.push('');
        if (Array.isArray(data)) {
            out.push(`${indent}export interface ${name} {`);
            for (const d of data)
                out.push(`${indent}  ${d}`);
        }
        else {
            out.push(`${indent}export namespace ${name} {`);
            printNamespaces(out, data, indent + '  ');
        }
        out.push(`${indent}}`);
        isFirst = false;
    }
}
async function generateAPIMap() {
    const { data: apiMap } = await axios_1.default.get(API_ENDPOINT, {
        responseType: 'json',
    });
    const namespaces = new Map();
    const packageJson = JSON.parse(await readFileAsync((0, path_1.join)(__dirname, '../package.json'), 'utf8'));
    const results = [
        `// Generate using ${packageJson === null || packageJson === void 0 ? void 0 : packageJson.name}, data from ${API_ENDPOINT}`,
        `// Do not edit manually!`,
        '',
        'export interface APIParameters {',
        '  [api: string]: [any, any];',
    ];
    for (const k in apiMap) {
        if (!(k in apiMap))
            continue;
        const path = k.replace('/APP/', '');
        results.push(`  '${escapeUnsaveCharacters(path)}': [`, `    ${dropOptionsToNamespaces(namespaces, path, apiMap[k])},`, '    any,', '  ];');
    }
    results.push('}', '');
    printNamespaces(results, namespaces);
    await writeFileAsync(WRITE_PATH, `${results.join('\n')}\n`);
}
generateAPIMap().catch(reason => console.error(reason.stack || reason));
//# sourceMappingURL=api-utils.js.map