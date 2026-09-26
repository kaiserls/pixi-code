import * as assert from 'node:assert/strict';

import * as vscode from 'vscode';

suite('Pixi Code extension', () => {
    test('contributes the Pixi executable setting', () => {
        const configuredExecutable = vscode.workspace.getConfiguration('pixi-code').get<string>('pixiExecutable');

        assert.equal(configuredExecutable, '');
    });
});
