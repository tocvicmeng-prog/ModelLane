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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const lmStudioApi_1 = require("./lmStudioApi");
const chatPanel_1 = require("./chatPanel");
const codeActions_1 = require("./codeActions");
const inlineCompletion_1 = require("./inlineCompletion");
const statusBar_1 = require("./statusBar");
const languageModelProvider_1 = require("./languageModelProvider");
const localModelProvider_1 = require("./localModelProvider");
const modelLaneProvider_1 = require("./modelLaneProvider");
let api;
function activate(context) {
    api = new lmStudioApi_1.LMStudioApi();
    const diagnosticsCmd = vscode.commands.registerCommand('lmstudio.diagnostics', async () => {
        const config = vscode.workspace.getConfiguration('lmstudio');
        const version = context.extension.packageJSON.version || 'unknown';
        const installPath = context.extensionUri.fsPath;
        const model = config.get('model', '') || 'Auto';
        const baseUrl = config.get('baseUrl', 'http://localhost:1234');
        const apiMode = config.get('apiMode', 'native');
        vscode.window.showInformationMessage(`ModelLane v${version} is active. LM Studio API: ${apiMode} ${baseUrl}. Model: ${model}. Path: ${installPath}`);
    });
    context.subscriptions.push(diagnosticsCmd);
    const chatCmd = vscode.commands.registerCommand('lmstudio.chat', () => {
        chatPanel_1.ChatPanel.createOrShow(api);
    });
    context.subscriptions.push(chatCmd);
    (0, codeActions_1.registerCodeActions)(context, api);
    (0, inlineCompletion_1.registerInlineCompletion)(context, api);
    (0, statusBar_1.registerStatusBar)(context, api);
    const languageModelProvider = new languageModelProvider_1.LMStudioLanguageModelProvider(api);
    const localModelProviders = (0, localModelProvider_1.createLocalModelProviders)();
    const modelLaneProvider = new modelLaneProvider_1.ModelLaneLanguageModelProvider(languageModelProvider, localModelProviders);
    context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider('modellane', modelLaneProvider));
    const refreshModelsCmd = vscode.commands.registerCommand('lmstudio.refreshLanguageModels', async () => {
        api.refreshConfig();
        languageModelProvider.refresh();
        localModelProviders.forEach(provider => provider.refresh());
        modelLaneProvider.refresh();
        vscode.window.showInformationMessage('ModelLane models refreshed.');
    });
    context.subscriptions.push(refreshModelsCmd);
    const senseLocalModelsCmd = vscode.commands.registerCommand('lmstudio.senseLocalModels', async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'ModelLane: sensing local model platforms',
            cancellable: true
        }, async (progress, token) => {
            api.refreshConfig();
            const results = [];
            progress.report({ message: 'Checking LM Studio...' });
            results.push(await probeLMStudio(api, token));
            for (const provider of localModelProviders) {
                if (token.isCancellationRequested)
                    return;
                progress.report({ message: `Checking ${provider.displayName}...` });
                results.push(await provider.probe(token));
            }
            languageModelProvider.refresh();
            localModelProviders.forEach(provider => provider.refresh());
            modelLaneProvider.refresh();
            if (!token.isCancellationRequested) {
                vscode.window.showInformationMessage(formatProbeResults(results));
            }
        });
    });
    context.subscriptions.push(senseLocalModelsCmd);
    const localModelsStatus = vscode.window.createStatusBarItem('lmstudio.localModelsSense', vscode.StatusBarAlignment.Right, 9999);
    localModelsStatus.name = 'ModelLane';
    localModelsStatus.text = '$(sync) ModelLane Refresh';
    localModelsStatus.tooltip = 'Click to sense and refresh installed local models for VS Code Chat';
    localModelsStatus.command = 'lmstudio.senseLocalModels';
    localModelsStatus.show();
    context.subscriptions.push(localModelsStatus);
    console.log('ModelLane extension activated');
}
function deactivate() {
    if (chatPanel_1.ChatPanel.currentPanel) {
        chatPanel_1.ChatPanel.currentPanel.dispose();
    }
}
async function probeLMStudio(api, token) {
    const baseUrl = vscode.workspace.getConfiguration('lmstudio').get('baseUrl', 'http://localhost:1234');
    try {
        const models = await api.listModels(toAbortSignal(token));
        return {
            displayName: 'LM Studio',
            baseUrl,
            reachable: true,
            available: models.length,
            running: models.filter(model => model.loaded).length
        };
    }
    catch (err) {
        return {
            displayName: 'LM Studio',
            baseUrl,
            reachable: false,
            available: 0,
            running: 0,
            error: err?.message || String(err)
        };
    }
}
function formatProbeResults(results) {
    const parts = results.map(result => {
        if (!result.reachable)
            return `${result.displayName}: offline`;
        return `${result.displayName}: ${result.running}/${result.available} running`;
    });
    return `Local model scan complete. ${parts.join('; ')}.`;
}
function toAbortSignal(token) {
    const controller = new AbortController();
    if (token.isCancellationRequested)
        controller.abort();
    token.onCancellationRequested(() => controller.abort());
    return controller.signal;
}
//# sourceMappingURL=extension.js.map