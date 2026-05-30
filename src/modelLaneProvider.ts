import * as vscode from 'vscode';
import { LMStudioLanguageModelInfo, LMStudioLanguageModelProvider } from './languageModelProvider';
import { LocalModelInfo, LocalModelLanguageModelProvider } from './localModelProvider';

type DelegateProvider = LMStudioLanguageModelProvider | LocalModelLanguageModelProvider;
type DelegateModelInfo = LMStudioLanguageModelInfo | LocalModelInfo;

type ModelLaneModelInfo = vscode.LanguageModelChatInformation & {
  source: string;
  delegateProvider: DelegateProvider;
  delegateModel: DelegateModelInfo;
};

export class ModelLaneLanguageModelProvider implements vscode.LanguageModelChatProvider<ModelLaneModelInfo> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;

  constructor(
    private readonly lmStudioProvider: LMStudioLanguageModelProvider,
    private readonly localProviders: LocalModelLanguageModelProvider[]
  ) { }

  refresh() {
    this.changeEmitter.fire();
  }

  async provideLanguageModelChatInformation(options: vscode.PrepareLanguageModelChatModelOptions, token: vscode.CancellationToken): Promise<ModelLaneModelInfo[]> {
    const results: ModelLaneModelInfo[] = [];

    try {
      const lmStudioModels = await this.lmStudioProvider.provideLanguageModelChatInformation(options, token) || [];
      results.push(...lmStudioModels
        .filter(model => model.loaded)
        .map(model => this.wrapModel('lmstudio', 'LM Studio', this.lmStudioProvider, model)));
    } catch (err) {
      console.warn('ModelLane LM Studio discovery failed', err);
    }

    for (const provider of this.localProviders) {
      if (token.isCancellationRequested) break;
      try {
        const models = await provider.provideLanguageModelChatInformation(options, token) || [];
        results.push(...models
          .filter(model => model.running)
          .map(model => this.wrapModel(provider.vendor, provider.displayName, provider, model)));
      } catch (err) {
        console.warn(`ModelLane ${provider.displayName} discovery failed`, err);
      }
    }

    return results.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  }

  async provideLanguageModelChatResponse(
    model: ModelLaneModelInfo,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    await (model.delegateProvider as any).provideLanguageModelChatResponse(model.delegateModel, messages, options, progress, token);
  }

  async provideTokenCount(model: ModelLaneModelInfo, text: string | vscode.LanguageModelChatRequestMessage, token: vscode.CancellationToken): Promise<number> {
    return (model.delegateProvider as any).provideTokenCount(model.delegateModel, text, token);
  }

  private wrapModel(
    source: string,
    sourceDisplayName: string,
    delegateProvider: DelegateProvider,
    delegateModel: DelegateModelInfo
  ): ModelLaneModelInfo {
    const rawName = stripReadyPrefix(delegateModel.name);
    const name = `✓ ${rawName}`;
    const detail = [sourceDisplayName, delegateModel.detail].filter(Boolean).join(' - ');
    const tooltip = [
      `${rawName}`,
      `Source: ${sourceDisplayName}`,
      'Status: ready / running',
      delegateModel.tooltip
    ].filter(Boolean).join('\n');

    return {
      id: `${source}:${delegateModel.id}`,
      source,
      delegateProvider,
      delegateModel,
      name,
      family: delegateModel.family,
      version: `${source}:${delegateModel.version}`,
      tooltip,
      detail,
      maxInputTokens: delegateModel.maxInputTokens,
      maxOutputTokens: delegateModel.maxOutputTokens,
      capabilities: delegateModel.capabilities
    };
  }
}

function stripReadyPrefix(value: string): string {
  return value.replace(/^(✓\s*READY|✓|○\s*NOT LOADED|\[(READY|NOT LOADED)])\s+/i, '');
}
