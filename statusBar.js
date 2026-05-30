"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStatusBar = registerStatusBar;
const vscode = __importStar(require("vscode"));
function registerStatusBar(context, api) {
    const statusItem = vscode.window.createStatusBarItem('lmstudio.status', vscode.StatusBarAlignment.Right, 10000);
    statusItem.name = 'ModelLane';
    statusItem.command = 'lmstudio.selectModel';
    statusItem.accessibilityInformation = {
        label: 'ModelLane status',
        role: 'button'
    };
    let cachedModels = [];
    updateStatus();
    const modelWatcher = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('lmstudio')) {
            api.refreshConfig();
            updateStatus();
        }
    });
    context.subscriptions.push(statusItem, modelWatcher);
    const selectModelCmd = vscode.commands.registerCommand('lmstudio.selectModel', async () => {
        try {
            statusItem.text = '$(loading~spin) $(server) ModelLane';
            const models = await api.listModels();
            cachedModels = models;
            const items = models.map(m => ({
                label: `${m.loaded ? '$(check) ' : '$(circle-slash) '}${m.name || m.id}`,
                description: m.id,
                detail: m.loaded ? 'Loaded' : 'Not loaded',
                id: m.id
            }));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select LM Studio model',
                title: `ModelLane: Select LM Studio Model (${models.length} available)`
            });
            if (picked) {
                const config = vscode.workspace.getConfiguration('lmstudio');
                await config.update('model', picked.id, vscode.ConfigurationTarget.Workspace);
                api.refreshConfig();
                await updateStatus();
                vscode.window.showInformationMessage(`LM Studio model: ${picked.label.replace(/^\$\([^)]+\)\s/, '')}`);
            }
            else {
                await updateStatus();
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Cannot reach LM Studio: ${err.message}`);
            statusItem.text = '$(server) ModelLane';
        }
    });
    context.subscriptions.push(selectModelCmd);
    const showStatusCmd = vscode.commands.registerCommand('lmstudio.showStatus', async () => {
        try {
            await updateStatus();
            vscode.window.showInformationMessage('ModelLane status refreshed and visible in the status bar.');
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to refresh ModelLane status: ${err.message}`);
        }
    });
    context.subscriptions.push(showStatusCmd);
    async function updateStatus() {
        const model = vscode.workspace.getConfiguration('lmstudio').get('model', '') || '';
        const baseUrl = vscode.workspace.getConfiguration('lmstudio').get('baseUrl', 'http://localhost:1234');
        if (!model || model.toLowerCase() === 'auto') {
            // Auto-detection mode
            statusItem.text = '$(server) ModelLane: LM Studio Auto';
            const tooltipParts = [
                `**Auto-detection enabled**`,
                `The extension will automatically select the best available model.`,
                `Server: ${baseUrl}`,
                '',
                'Click to manually select a model'
            ];
            statusItem.tooltip = new vscode.MarkdownString(tooltipParts.join('\n\n'));
            statusItem.show();
            return;
        }
        // Find the model in cache to get loaded status
        const modelInfo = cachedModels.find(m => m.id === model);
        const isLoaded = modelInfo?.loaded ?? true; // Assume loaded if not in cache
        const modelDisplay = model.split('/').pop() || model;
        const statusIcon = isLoaded ? '$(check)' : '$(circle-slash)';
        statusItem.text = `${statusIcon} $(server) ModelLane: ${modelDisplay}`;
        const tooltipParts = [
            `**Model:** ${model}`,
            `**Status:** ${isLoaded ? 'Loaded ✓' : 'Not loaded ⊘'}`,
            `**Server:** ${baseUrl}`,
            '',
            'Click to change model'
        ];
        statusItem.tooltip = new vscode.MarkdownString(tooltipParts.join('\n\n'));
        statusItem.show();
    }
}
//# sourceMappingURL=statusBar.js.map