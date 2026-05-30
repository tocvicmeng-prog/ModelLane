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
exports.ModelLaneLanguageModelProvider = void 0;
const vscode = __importStar(require("vscode"));
class ModelLaneLanguageModelProvider {
    lmStudioProvider;
    localProviders;
    changeEmitter = new vscode.EventEmitter();
    onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
    constructor(lmStudioProvider, localProviders) {
        this.lmStudioProvider = lmStudioProvider;
        this.localProviders = localProviders;
    }
    refresh() {
        this.changeEmitter.fire();
    }
    async provideLanguageModelChatInformation(options, token) {
        const results = [];
        try {
            const lmStudioModels = await this.lmStudioProvider.provideLanguageModelChatInformation(options, token) || [];
            results.push(...lmStudioModels
                .filter(model => model.loaded)
                .map(model => this.wrapModel('lmstudio', 'LM Studio', this.lmStudioProvider, model)));
        }
        catch (err) {
            console.warn('ModelLane LM Studio discovery failed', err);
        }
        for (const provider of this.localProviders) {
            if (token.isCancellationRequested)
                break;
            try {
                const models = await provider.provideLanguageModelChatInformation(options, token) || [];
                results.push(...models
                    .filter(model => model.running)
                    .map(model => this.wrapModel(provider.vendor, provider.displayName, provider, model)));
            }
            catch (err) {
                console.warn(`ModelLane ${provider.displayName} discovery failed`, err);
            }
        }
        return results.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
    }
    async provideLanguageModelChatResponse(model, messages, options, progress, token) {
        await model.delegateProvider.provideLanguageModelChatResponse(model.delegateModel, messages, options, progress, token);
    }
    async provideTokenCount(model, text, token) {
        return model.delegateProvider.provideTokenCount(model.delegateModel, text, token);
    }
    wrapModel(source, sourceDisplayName, delegateProvider, delegateModel) {
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
exports.ModelLaneLanguageModelProvider = ModelLaneLanguageModelProvider;
function stripReadyPrefix(value) {
    return value.replace(/^(✓\s*READY|✓|○\s*NOT LOADED|\[(READY|NOT LOADED)])\s+/i, '');
}
//# sourceMappingURL=modelLaneProvider.js.map