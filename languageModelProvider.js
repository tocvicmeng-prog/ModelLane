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
exports.LMStudioLanguageModelProvider = void 0;
const vscode = __importStar(require("vscode"));
class LMStudioLanguageModelProvider {
    api;
    changeEmitter = new vscode.EventEmitter();
    onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
    constructor(api) {
        this.api = api;
    }
    refresh() {
        this.changeEmitter.fire();
    }
    async provideLanguageModelChatInformation(_options, token) {
        const models = await this.api.listModels(toAbortSignal(token));
        return models
            .map(toLanguageModelInfo)
            .sort((a, b) => Number(b.loaded) - Number(a.loaded) || stripStatePrefix(a.name).localeCompare(stripStatePrefix(b.name)));
    }
    async provideLanguageModelChatResponse(model, messages, _options, progress, token) {
        if (!model.loaded) {
            throw new Error(`"${stripStatePrefix(model.name)}" is installed in LM Studio but is not loaded. Load it in LM Studio first, then run "ModelLane: Sense and Refresh Installed Models".`);
        }
        const chatMessages = messages
            .map(toChatMessage)
            .filter((message) => Boolean(message?.content.trim()));
        for await (const chunk of this.api.chatStream(chatMessages, model.lmstudioId)) {
            if (token.isCancellationRequested || chunk.done)
                break;
            if (chunk.content)
                progress.report(new vscode.LanguageModelTextPart(stripReasoningNoise(chunk.content)));
        }
    }
    async provideTokenCount(_model, text, _token) {
        const value = typeof text === 'string' ? text : messagePartsToText(text.content);
        return Math.max(1, Math.ceil(value.length / 4));
    }
}
exports.LMStudioLanguageModelProvider = LMStudioLanguageModelProvider;
function toLanguageModelInfo(model) {
    const loaded = Boolean(model.loaded);
    const baseName = model.name || model.id;
    const stateLabel = loaded ? '✓ READY' : '○ NOT LOADED';
    const statusDetail = loaded ? 'Ready to use now' : 'Not loaded in LM Studio';
    const detail = [statusDetail, model.detail].filter(Boolean).join(' - ');
    const tooltip = [
        `${stateLabel} ${baseName}`,
        loaded ? 'Status: ready / loaded in LM Studio' : 'Status: installed but not loaded in LM Studio',
        model.tooltip
    ].filter(Boolean).join('\n');
    return {
        id: model.id,
        lmstudioId: model.id,
        loaded,
        name: `${stateLabel} ${baseName}`,
        family: model.family || 'lmstudio',
        version: model.version || model.id,
        tooltip,
        detail,
        maxInputTokens: model.maxInputTokens || 32768,
        maxOutputTokens: model.maxOutputTokens || 8192,
        capabilities: {
            imageInput: model.imageInput || false,
            toolCalling: loaded && model.toolCalling ? 32 : false
        }
    };
}
function stripStatePrefix(value) {
    return value.replace(/^(✓\s*READY|○\s*NOT LOADED|\[(READY|NOT LOADED)])\s+/i, '');
}
function toChatMessage(message) {
    const content = messagePartsToText(message.content);
    switch (message.role) {
        case vscode.LanguageModelChatMessageRole.Assistant:
            return { role: 'assistant', content };
        case vscode.LanguageModelChatMessageRole.User:
            return { role: 'user', content };
        default:
            return undefined;
    }
}
function messagePartsToText(parts) {
    return parts
        .map(part => {
        if (part instanceof vscode.LanguageModelTextPart)
            return part.value;
        if (part instanceof vscode.LanguageModelToolResultPart) {
            return part.content.map(resultPart => {
                if (resultPart instanceof vscode.LanguageModelTextPart)
                    return resultPart.value;
                return '';
            }).join('');
        }
        return '';
    })
        .filter(Boolean)
        .join('\n');
}
function toAbortSignal(token) {
    const controller = new AbortController();
    if (token.isCancellationRequested)
        controller.abort();
    token.onCancellationRequested(() => controller.abort());
    return controller.signal;
}
function stripReasoningNoise(text) {
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<\|channel>thought\s*<channel\|>/gi, '')
        .replace(/<\|channel>final\s*<channel\|>/gi, '')
        .replace(/<end$/gi, '');
}
//# sourceMappingURL=languageModelProvider.js.map