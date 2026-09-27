import * as assert from 'node:assert/strict';
import { spawn as realSpawn, SpawnOptions } from 'node:child_process';
import { EventEmitter as NodeEventEmitter } from 'node:events';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';

import { PixiEnvironment } from '../pixi/types';

type SpawnCall = { executable: string; args: string[]; options: SpawnOptions };
type SpawnResult = { stdout?: string; stderr?: string; exitCode?: number };

const calls: SpawnCall[] = [];
const infoMessages: string[] = [];
const errorMessages: string[] = [];
let configuredExecutable = 'pixi';
let workspaceFolders: { uri: { fsPath: string } }[] = [];
let respond: (call: SpawnCall) => SpawnResult = () => ({ exitCode: 0 });
let useRealSpawn = false;

class TestEventEmitter<T> {
    event = () => undefined;
    fire(_value: T) {}
    dispose() {}
}

const vscode = {
    CancellationError: class extends Error {},
    EventEmitter: TestEventEmitter,
    ProgressLocation: { Window: 1 },
    ThemeIcon: class {
        constructor(readonly id: string) {}
    },
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    window: {
        showErrorMessage: () => undefined,
        withProgress: async <T>(_options: unknown, task: () => Promise<T>) => task(),
    },
    workspace: {
        getConfiguration: () => ({ get: () => configuredExecutable }),
        get workspaceFolders() {
            return workspaceFolders;
        },
    },
};

const childProcess = {
    spawn(executable: string, args: string[], options: SpawnOptions) {
        const call = { executable, args, options };
        calls.push(call);
        if (useRealSpawn) {
            return realSpawn(executable, args, options);
        }
        const proc = new NodeEventEmitter() as NodeEventEmitter & {
            stdout: NodeEventEmitter;
            stderr: NodeEventEmitter;
            kill: () => void;
        };
        proc.stdout = new NodeEventEmitter();
        proc.stderr = new NodeEventEmitter();
        proc.kill = () => undefined;
        queueMicrotask(() => {
            const result = respond(call);
            if (result.stdout) {
                proc.stdout.emit('data', result.stdout);
            }
            if (result.stderr) {
                proc.stderr.emit('data', result.stderr);
            }
            proc.emit('exit', result.exitCode ?? 0);
            proc.emit('close');
        });
        return proc;
    },
};

// VS Code is unavailable in Node's unit-test process. Load the production modules
// with only their host APIs replaced; the discovery and command logic remains real.
const loader = require('node:module') as {
    _load: (request: string, parent?: NodeModule, isMain?: boolean) => unknown;
};
const originalLoad = loader._load;
loader._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscode;
    }
    if (request === 'child_process') {
        return childProcess;
    }
    if (request === '@vscode/python-environments') {
        return { PackageChangeKind: { add: 1, remove: 2 } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { getPixi, refreshPixi, runPixi } = require('../pixi/utils') as typeof import('../pixi/utils');
const { PixiPackageManager } = require('../pixi/projectManager') as typeof import('../pixi/projectManager');
const { registerLogger } = require('../common/logging') as typeof import('../common/logging');
loader._load = originalLoad;

registerLogger({
    info: (message: string) => void infoMessages.push(message),
    error: (message: string) => void errorMessages.push(message),
    debug: () => undefined,
} as unknown as Parameters<typeof registerLogger>[0]);

test('an unsupported Pixi environment does not hide valid Python environments', async () => {
    calls.length = 0;
    infoMessages.length = 0;
    errorMessages.length = 0;
    workspaceFolders = [{ uri: { fsPath: path.resolve('workspace') } }];
    const projectPath = path.resolve('workspace', 'project');
    respond = ({ args }) => {
        if (args[0] === 'info') {
            return {
                stdout: JSON.stringify({
                    project_info: { name: 'project', manifest_path: path.join(projectPath, 'pixi.toml') },
                    environments_info: [
                        { name: 'default', prefix: path.join(projectPath, '.pixi', 'envs', 'default') },
                        { name: 'foreign', prefix: path.join(projectPath, '.pixi', 'envs', 'foreign') },
                        { name: 'test', prefix: path.join(projectPath, '.pixi', 'envs', 'test') },
                    ],
                }),
            };
        }
        const envName = args.at(-1);
        if (envName === 'foreign') {
            return { stderr: "No packages found in 'foreign' environment for this platform", exitCode: 1 };
        }
        return { stdout: JSON.stringify([{ name: 'python', version: '3.12.1', is_explicit: true }]) };
    };

    const environments = await refreshPixi(projectPath);

    assert.deepEqual(
        environments.map((environment) => environment.name),
        ['project:default (3.12.1)', 'project:test (3.12.1)'],
    );
    assert.equal(calls.length, 4);
    assert.ok(calls.every((call) => call.options.cwd === projectPath));
    assert.ok(
        errorMessages.some(
            (message) =>
                message.includes("Could not list packages for Pixi environment 'project:foreign'") &&
                message.includes(projectPath),
        ),
    );
});

test('package refresh uses the Pixi environment name and keeps existing packages on failure', async () => {
    calls.length = 0;
    infoMessages.length = 0;
    errorMessages.length = 0;
    const projectPath = path.resolve('workspace', 'project');
    const prefix = path.join(projectPath, '.pixi', 'envs', 'default');
    const packages = [{ name: 'python', version: '3.12.1' }];
    const environment = {
        name: 'project:default (3.12.1)',
        envId: { id: prefix },
        packages,
        pixiInfo: {
            project_info: { name: 'project', manifest_path: path.join(projectPath, 'pixi.toml') },
            environments_info: [{ name: 'default', prefix }],
        },
    } as unknown as PixiEnvironment;
    const manager = new PixiPackageManager(
        {} as ConstructorParameters<typeof PixiPackageManager>[0],
        {} as ConstructorParameters<typeof PixiPackageManager>[1],
    );

    respond = () => ({ stderr: 'Pixi list failed', exitCode: 1 });
    await manager.refresh(environment);
    assert.equal(environment.packages, packages);
    assert.equal(calls[0].args.at(-1), 'default');
    assert.equal(calls[0].options.cwd, projectPath);
    assert.ok(
        errorMessages.some((message) => message.includes('Pixi command') && message.includes('Pixi list failed')),
    );
    assert.ok(
        errorMessages.some(
            (message) => message.includes('Failed to refresh packages') && message.includes(projectPath),
        ),
    );

    respond = () => ({ stdout: JSON.stringify([{ name: 'python', version: '3.13.0', is_explicit: true }]) });
    await manager.refresh(environment);
    assert.equal(environment.packages[0].version, '3.13.0');
});

test('configured Pixi paths resolve from workspaces and commands use a workspace cwd', async () => {
    calls.length = 0;
    const root = await mkdtemp(path.join(os.tmpdir(), 'pixi code '));
    const firstFolder = path.join(root, 'first');
    const secondFolder = path.join(root, 'second');
    const secondExecutable = path.join(secondFolder, 'bin', 'pixi');
    try {
        await mkdir(path.dirname(secondExecutable), { recursive: true });
        await mkdir(firstFolder);
        await writeFile(secondExecutable, '');
        workspaceFolders = [{ uri: { fsPath: firstFolder } }, { uri: { fsPath: secondFolder } }];
        configuredExecutable = path.join('bin', 'pixi');
        assert.equal(await getPixi(), secondExecutable);

        respond = () => ({ stdout: 'pixi 0.67.0' });
        assert.equal(await runPixi(['--version']), 'pixi 0.67.0');
        assert.equal(calls[0].executable, `"${secondExecutable}"`);
        assert.equal(calls[0].options.cwd, firstFolder);

        await runPixi(['--version'], { cwd: secondFolder });
        assert.equal(calls[1].options.cwd, secondFolder);

        configuredExecutable = '${workspaceFolder}/bin/pixi';
        assert.equal(await getPixi(), path.join(firstFolder, 'bin', 'pixi'));
    } finally {
        configuredExecutable = 'pixi';
        workspaceFolders = [];
        await rm(root, { recursive: true, force: true });
    }
});

test('a configured executable in a path with spaces can run through the shell', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pixi executable '));
    const executable = path.join(root, process.platform === 'win32' ? 'pixi.cmd' : 'pixi');
    try {
        const script =
            process.platform === 'win32'
                ? '@echo off\r\necho pixi-test %1\r\n'
                : '#!/bin/sh\nprintf "pixi-test %s\\n" "$1"\n';
        await writeFile(executable, script);
        if (process.platform !== 'win32') {
            await chmod(executable, 0o755);
        }
        configuredExecutable = executable;
        workspaceFolders = [{ uri: { fsPath: root } }];
        useRealSpawn = true;

        assert.equal((await runPixi(['--version'])).trim(), 'pixi-test --version');
    } finally {
        useRealSpawn = false;
        configuredExecutable = 'pixi';
        workspaceFolders = [];
        await rm(root, { recursive: true, force: true });
    }
});
