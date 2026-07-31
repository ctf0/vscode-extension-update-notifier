import * as vscode from 'vscode'

const CACHE_KEY = 'extensionVersions'

type VersionSnapshot = Record<string, string>

interface ExtensionChange {
    name        : string
    oldVersion? : string
    version     : string
}

function isInternal(ext: vscode.Extension<unknown>) {
    return ext.id.startsWith('vscode.')
}

function extensionName(ext: vscode.Extension<unknown>): string {
    return ext.packageJSON.displayName || ext.packageJSON.name || ext.id
}

/**
 * Compare the last known snapshot against the current state and notify about
 * any extensions that were updated or installed in the meantime.
 */
async function checkForChanges(context: vscode.ExtensionContext): Promise<void> {
    const previous = context.globalState.get<VersionSnapshot>(CACHE_KEY)
    const current: VersionSnapshot = {}
    const updated: ExtensionChange[] = []
    const installed: ExtensionChange[] = []

    for (const ext of vscode.extensions.all) {
        if (isInternal(ext)) {
            continue
        }

        const version = ext.packageJSON?.version

        if (typeof version !== 'string') {
            continue
        }

        current[ext.id] = version

        // First run: nothing to compare against yet, just persist a baseline
        if (previous === undefined) {
            continue
        }

        const name = extensionName(ext)
        const oldVersion = previous[ext.id]

        if (oldVersion === undefined) {
            installed.push({name, version})
        } else if (oldVersion !== version) {
            updated.push({name, oldVersion, version})
        }
    }

    if (previous !== undefined) {
        notify(updated, installed)
    }

    await context.globalState.update(CACHE_KEY, current)
}

function notify(updated: ExtensionChange[], installed: ExtensionChange[]): void {
    const total = updated.length + installed.length

    if (total === 0) {
        return
    }

    if (total === 1) {
        const change = updated[0] ?? installed[0]
        vscode.window.showInformationMessage(
            change.oldVersion === undefined
                ? `Extension Installed: ${change.name} (v${change.version})`
                : `Extension Updated: ${change.name} is now at v${change.version}`,
        )

        return
    }

    const names = [...updated, ...installed].map((change) => change.name)
    const shown = names.slice(0, 3).join(', ')
    const remainder = names.length - 3
    const summary = [
        updated.length > 0
            ? `${updated.length} extension${updated.length === 1 ? '' : 's'} updated`
            : '',
        installed.length > 0
            ? `${installed.length} extension${installed.length === 1 ? '' : 's'} installed`
            : '',
    ]
        .filter(Boolean)
        .join(' and ')

    vscode.window.showInformationMessage(
        `${summary}: ${shown}${remainder > 0 ? `, +${remainder} more` : ''}`,
        'View',
    ).then((selection) => {
        if (selection === 'View') {
            void vscode.commands.executeCommand('workbench.extensions.search', '@updates')
        }
    })
}

export function activate(context: vscode.ExtensionContext) {
    let checkPromise: Promise<void> | undefined
    let debounceTimer: NodeJS.Timeout | undefined

    const runCheck = () => {
        // Never run two comparisons concurrently, otherwise both would
        // compare against the same stale snapshot and duplicate popups
        if (checkPromise) {
            return
        }

        checkPromise = checkForChanges(context).finally(() => {
            checkPromise = undefined
        })
    }

    // Catch updates that were applied while the extension host was not
    // running (e.g. during a VS Code restart) or before this extension
    // was activated
    runCheck()

    const extensionChangeListener = vscode.extensions.onDidChange(() => {
        if (debounceTimer) {
            clearTimeout(debounceTimer)
        }

        // The event can fire several times in a row while extensions are
        // being installed/updated, wait for the dust to settle first
        debounceTimer = setTimeout(runCheck, 200)
    })

    context.subscriptions.push(extensionChangeListener)
}

export function deactivate() { }
