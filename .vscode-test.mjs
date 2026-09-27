import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/**/*.vscode.test.js',
    version: 'stable',
    mocha: {
        ui: 'tdd',
        timeout: 20_000,
    },
});
