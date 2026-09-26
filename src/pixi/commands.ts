/**
 * Builds the Pixi command used to retrieve packages for one environment.
 *
 * `envName` must be Pixi's canonical environment name, not the decorated name
 * displayed by VS Code (for example, `project:dev (3.12.0)`).
 */
export function createListPixiPackagesArgs(envName: string): string[] {
    return ['list', '--no-install', '--frozen', '--json', '--environment', envName];
}
