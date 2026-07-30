import * as vscode from 'vscode'

const extensionCache = new Map<string, string>()

function updateCache() {
    extensionCache.clear()
    vscode.extensions.all.forEach((ext) => {
        if (!isInternal(ext)) {
            extensionCache.set(ext.id, ext.packageJSON.version)
        }
    })
}

function isInternal(ext: any) {
    return ext.id.startsWith('vscode.')
}

export function activate(context: vscode.ExtensionContext) {
    updateCache()

    const extensionChangeListener = vscode.extensions.onDidChange(() => {
        for (const ext of vscode.extensions.all) {
            if (isInternal(ext)) {
                continue
            }

            const cachedVersion = extensionCache.get(ext.id)
            const currentVersion = ext.packageJSON.version
            const extensionName = ext.packageJSON.displayName || ext.packageJSON.name

            // Scenario A: The extension was updated to a newer version
            if (cachedVersion && cachedVersion !== currentVersion) {
                vscode.window.showInformationMessage(
                    `Extension Updated: ${extensionName} is now at v${currentVersion}`,
                )
                break
            }
            // Scenario B: A completely new extension was installed
            else if (!cachedVersion) {
                vscode.window.showInformationMessage(
                    `Extension Installed: ${extensionName} (v${currentVersion})`,
                )
                break
            }
        }

        updateCache()
    })

    context.subscriptions.push(extensionChangeListener)
}

export function deactivate() { }
