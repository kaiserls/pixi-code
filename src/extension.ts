import semver from 'semver';
import { ExtensionContext, window } from 'vscode';

import { registerLogger } from './common/logging';
import { setPersistentState } from './common/persistentState';
import { PixiEnvManager } from './pixi/envManager';
import { PixiPackageManager } from './pixi/projectManager';
import { getPixi, runPixi } from './pixi/utils';
import { getEnvExtApi } from './pythonEnvsApi';

const MINIMUM_PIXI_VERSION = '0.53.0';

export async function activate(context: ExtensionContext) {
    const log = window.createOutputChannel('Pixi Environment Manager', { log: true });
    context.subscriptions.push(log, registerLogger(log));

    try {
        log.info('Activating Pixi Code');
        const api = await getEnvExtApi();

        // Validate Pixi installation
        const stdout = await runPixi(['--version']);
        const versionMatch = stdout.trim().match(/^pixi (\d+\.\d+\.\d+)/);
        if (!versionMatch) {
            const errorMsg = `Found invalid Pixi binary at ${await getPixi()}.`;
            window.showErrorMessage(errorMsg);
            throw new Error(errorMsg);
        }

        const currentVersion = versionMatch[1];

        // Check if the current version meets the minimum requirement using semver
        if (!semver.gte(currentVersion, MINIMUM_PIXI_VERSION)) {
            const errorMsg =
                `Pixi version ${currentVersion} is too old. ` +
                `This extension requires Pixi version ${MINIMUM_PIXI_VERSION} or newer. ` +
                `Please update Pixi by running: pixi self-update`;
            window.showErrorMessage(errorMsg);
            throw new Error(errorMsg);
        }

        log.info(`Using Pixi ${currentVersion}`);

        // Setup the persistent state for the extension.
        setPersistentState(context);

        const manager = new PixiEnvManager(api, log);
        context.subscriptions.push(api.registerEnvironmentManager(manager));
        log.info('Registered Pixi environment manager');

        const packageManager = new PixiPackageManager(api, log);
        context.subscriptions.push(api.registerPackageManager(packageManager));
        log.info('Registered Pixi package manager');
    } catch (error) {
        log.error('Pixi Code activation failed', error);
        throw error;
    }
}
