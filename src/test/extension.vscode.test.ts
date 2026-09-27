import * as assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { PythonEnvironmentApi } from '@vscode/python-environments';
import * as vscode from 'vscode';

import { EXTENSION_ID, PIXI_MANAGER_ID } from '../common/utils';

suite('Pixi Code extension', () => {
    test('contributes an empty default Pixi executable setting', () => {
        const setting = vscode.workspace.getConfiguration('pixi-code').inspect<string>('pixiExecutable');

        assert.equal(setting?.defaultValue, '');
    });

    test('selects the Pixi default environment through Python Environments', async function () {
        this.timeout(120_000);

        const pixiExtension = vscode.extensions.getExtension(EXTENSION_ID);
        const pythonEnvsExtension =
            vscode.extensions.getExtension<PythonEnvironmentApi>('ms-python.vscode-python-envs');
        assert.ok(pixiExtension, 'Pixi Code must be loaded in the extension test host');
        assert.ok(pythonEnvsExtension, 'Python Environments must be installed in the extension test host');

        const api = await pythonEnvsExtension.activate();
        await pixiExtension.activate();

        const environments = await api.getEnvironments('all');
        const pixiEnvironment = environments.find(
            (environment) =>
                environment.envId.managerId === PIXI_MANAGER_ID && environment.name.startsWith('pixi-project:default'),
        );
        assert.ok(pixiEnvironment, 'The Pixi fixture default environment must be discoverable');

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'The Pixi fixture must be open as the test workspace');
        const scope = workspaceFolder.uri;
        const settingsPath = path.join(scope.fsPath, '.vscode', 'settings.json');
        const originalSettings = await readFile(settingsPath).catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') {
                return undefined;
            }
            throw error;
        });
        const previousEnvironment = await api.getEnvironment(scope);
        try {
            await api.setEnvironment(scope, pixiEnvironment);
            const selectedEnvironment = await api.getEnvironment(scope);

            assert.equal(
                selectedEnvironment?.envId.id,
                pixiEnvironment.envId.id,
                'Python Environments did not select the Pixi interpreter; check its output for a missing manager',
            );
        } finally {
            try {
                await api.setEnvironment(scope, previousEnvironment);
            } finally {
                if (originalSettings) {
                    await writeFile(settingsPath, originalSettings);
                } else {
                    await rm(settingsPath, { force: true });
                }
            }
        }
    });
});
