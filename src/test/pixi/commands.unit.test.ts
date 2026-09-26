import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { createListPixiPackagesArgs } from '../../pixi/commands';

test('uses the canonical Pixi environment name instead of its VS Code display label', () => {
    const displayName = 'my-project:dev (3.12.0)';
    const canonicalName = 'dev';

    const args = createListPixiPackagesArgs(canonicalName);

    assert.deepEqual(args, ['list', '--no-install', '--frozen', '--json', '--environment', 'dev']);
    assert.ok(!args.includes(displayName));
});
