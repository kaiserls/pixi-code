import * as assert from 'node:assert/strict';

import * as vscode from 'vscode';

suite('Pixi Code extension', () => {
    test('contributes an empty default Pixi executable setting', () => {
        const setting = vscode.workspace.getConfiguration('pixi-code').inspect<string>('pixiExecutable');

        assert.equal(setting?.defaultValue, '');
    });
});
