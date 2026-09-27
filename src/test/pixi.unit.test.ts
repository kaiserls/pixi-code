import * as assert from 'node:assert/strict';
import { EventEmitter as NodeEventEmitter } from 'node:events';
import * as path from 'node:path';
import { test } from 'node:test';

import { PixiEnvironment } from '../pixi/types';

type SpawnCall = { executable: string; args: string[]; options: { cwd?: string } };
type SpawnResult = { stdout?: string; stderr?: string; exitCode?: number };

const calls: SpawnCall[] = [];
const infoMessages: string[] = [];
let configuredExecutable = 'pixi';
let workspaceFolders: { uri: { fsPath: string } }[] = [];
let respond: (call: SpawnCall) => SpawnResult = () => ({ exitCode: 0 });

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
    spawn(executable: string, args: string[], options: { cwd?: string }) {
        const call = { executable, args, options };
        calls.push(call);
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
const { refreshPixi } = require('../pixi/utils') as typeof import('../pixi/utils');
const { PixiPackageManager } = require('../pixi/projectManager') as typeof import('../pixi/projectManager');
const { registerLogger } = require('../common/logging') as typeof import('../common/logging');
loader._load = originalLoad;

registerLogger({
    info: (message: string) => void infoMessages.push(message),
    error: () => undefined,
    debug: () => undefined,
} as unknown as Parameters<typeof registerLogger>[0]);

test('an unsupported Pixi environment does not hide valid Python environments', async () => {
    calls.length = 0;
    infoMessages.length = 0;
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
    assert.ok(infoMessages.some((message) => message.includes("Skipping Pixi environment 'foreign'")));
});

test('package refresh uses the Pixi environment name and keeps existing packages on failure', async () => {
    calls.length = 0;
    infoMessages.length = 0;
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
    assert.ok(infoMessages.some((message) => message.includes('Failed to refresh packages')));

    respond = () => ({ stdout: JSON.stringify([{ name: 'python', version: '3.13.0', is_explicit: true }]) });
    await manager.refresh(environment);
    assert.equal(environment.packages[0].version, '3.13.0');
});
