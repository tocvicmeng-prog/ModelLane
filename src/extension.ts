import * as vscode from 'vscode';
import { LMStudioApi } from './lmStudioApi';
import { ChatPanel } from './chatPanel';
import { registerCodeActions } from './codeActions';
import { registerInlineCompletion } from './inlineCompletion';
import { registerStatusBar } from './statusBar';
import { LMStudioLanguageModelProvider } from './languageModelProvider';
import { createLocalModelProviders, LocalModelProbeResult } from './localModelProvider';
import { ModelLaneLanguageModelProvider } from './modelLaneProvider';

let api: LMStudioApi;

export function activate(context: vscode.ExtensionContext) {
  api = new LMStudioApi();

  const diagnosticsCmd = vscode.commands.registerCommand('lmstudio.diagnostics', async () => {
    const config = vscode.workspace.getConfiguration('lmstudio');
    const version = context.extension.packageJSON.version || 'unknown';
    const installPath = context.extensionUri.fsPath;
    const model = config.get('model', '') || 'Auto';
    const baseUrl = config.get('baseUrl', 'http://localhost:1234');
    const apiMode = config.get('apiMode', 'native');

    vscode.window.showInformationMessage(
      `ModelLane v${version} is active. LM Studio API: ${apiMode} ${baseUrl}. Model: ${model}. Path: ${installPath}`
    );
  });
  context.subscriptions.push(diagnosticsCmd);

  const chatCmd = vscode.commands.registerCommand('lmstudio.chat', () => {
    ChatPanel.createOrShow(api);
  });
  context.subscriptions.push(chatCmd);

  registerCodeActions(context, api);
  registerInlineCompletion(context, api);
  registerStatusBar(context, api);

  const languageModelProvider = new LMStudioLanguageModelProvider(api);
  const localModelProviders = createLocalModelProviders();
  const modelLaneProvider = new ModelLaneLanguageModelProvider(languageModelProvider, localModelProviders);
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
      const results: LocalModelProbeResult[] = [];

      progress.report({ message: 'Checking LM Studio...' });
      results.push(await probeLMStudio(api, token));

      for (const provider of localModelProviders) {
        if (token.isCancellationRequested) return;
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

export function deactivate() {
  if (ChatPanel.currentPanel) {
    ChatPanel.currentPanel.dispose();
  }
}

async function probeLMStudio(api: LMStudioApi, token: vscode.CancellationToken): Promise<LocalModelProbeResult> {
  const baseUrl = vscode.workspace.getConfiguration('lmstudio').get<string>('baseUrl', 'http://localhost:1234');
  try {
    const models = await api.listModels(toAbortSignal(token));
    return {
      displayName: 'LM Studio',
      baseUrl,
      reachable: true,
      available: models.length,
      running: models.filter(model => model.loaded).length
    };
  } catch (err: any) {
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

function formatProbeResults(results: LocalModelProbeResult[]): string {
  const parts = results.map(result => {
    if (!result.reachable) return `${result.displayName}: offline`;
    return `${result.displayName}: ${result.running}/${result.available} running`;
  });
  return `Local model scan complete. ${parts.join('; ')}.`;
}

function toAbortSignal(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  if (token.isCancellationRequested) controller.abort();
  token.onCancellationRequested(() => controller.abort());
  return controller.signal;
}
