import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    files: 'out/test/**/*.vscode.test.js',
    version: 'stable',
    workspaceFolder: fileURLToPath(new URL('./test/fixtures/pixi-project/', import.meta.url)),
    mocha: {
        ui: 'tdd',
        timeout: 20_000,
    },
});
