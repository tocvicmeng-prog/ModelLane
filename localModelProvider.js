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
exports.LocalModelLanguageModelProvider = void 0;
exports.createLocalModelProviders = createLocalModelProviders;
const vscode = __importStar(require("vscode"));
class LocalModelLanguageModelProvider {
    config;
    changeEmitter = new vscode.EventEmitter();
    onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
    vendor;
    displayName;
    constructor(config) {
        this.config = config;
        this.vendor = config.vendor;
        this.displayName = config.displayName;
    }
    refresh() {
        this.changeEmitter.fire();
    }
    async probe(token) {
        try {
            const models = this.config.source === 'ollama'
                ? await this.listOllamaModels(token)
                : await this.listOpenAIModels(token);
            return {
                displayName: this.config.displayName,
                baseUrl: this.configuredBaseUrl(),
                reachable: true,
                available: models.length,
                running: models.filter(model => model.running).length
            };
        }
        catch (err) {
            return {
                displayName: this.config.displayName,
                baseUrl: this.configuredBaseUrl(),
                reachable: false,
                available: 0,
                running: 0,
                error: err?.message || String(err)
            };
        }
    }
    async provideLanguageModelChatInformation(_options, token) {
        try {
            const models = this.config.source === 'ollama'
                ? await this.listOllamaModels(token)
                : await this.listOpenAIModels(token);
            return models;
        }
        catch (err) {
            console.warn(`${this.config.displayName} model discovery failed`, err);
            return [];
        }
    }
    async provideLanguageModelChatResponse(model, messages, options, progress, token) {
        const chatMessages = toBackendMessages(messages);
        const tools = toOpenAITools(options.tools);
        const stream = this.config.source === 'ollama'
            ? this.ollamaChatStream(model.localId, chatMessages, tools, token)
            : this.openAIChatStream(model.localId, chatMessages, tools, options.toolMode, token);
        for await (const part of stream) {
            if (token.isCancellationRequested || part.kind === 'done')
                break;
            if (part.kind === 'text' && part.content) {
                progress.report(new vscode.LanguageModelTextPart(stripReasoningNoise(part.content)));
            }
            if (part.kind === 'toolCall') {
                progress.report(new vscode.LanguageModelToolCallPart(part.callId, part.name, part.input));
            }
        }
    }
    async provideTokenCount(_model, text, _token) {
        const value = typeof text === 'string' ? text : messagePartsToText(text.content);
        return Math.max(1, Math.ceil(value.length / 4));
    }
    async listOllamaModels(token) {
        const signal = toAbortSignal(token);
        const [tags, running] = await Promise.all([
            fetch(this.endpoint('/api/tags'), { signal }),
            this.listOllamaRunningModels(signal)
        ]);
        if (!tags.ok)
            throw new Error(`${this.config.displayName} API error (${tags.status})`);
        const data = await tags.json();
        return (data.models || []).map((model) => {
            const id = model.model || model.name;
            const details = model.details || {};
            const parameterSize = details.parameter_size || '';
            const quantization = details.quantization_level || '';
            const family = details.family || normalizeFamily(id);
            const isRunning = running.has(id) || running.has(model.name);
            return {
                id,
                localId: id,
                running: isRunning,
                name: model.name || id,
                family,
                version: id,
                detail: [isRunning ? 'Running' : 'Installed', parameterSize, quantization, this.config.modelDetail].filter(Boolean).join(' - '),
                tooltip: [
                    model.name || id,
                    `Provider: ${this.config.displayName}`,
                    isRunning ? 'Status: running' : 'Status: installed',
                    parameterSize ? `Parameters: ${parameterSize}` : '',
                    quantization ? `Quantization: ${quantization}` : '',
                    details.format ? `Format: ${details.format}` : ''
                ].filter(Boolean).join('\n'),
                maxInputTokens: 32768,
                maxOutputTokens: 8192,
                capabilities: {
                    imageInput: false,
                    toolCalling: 32
                }
            };
        });
    }
    async listOllamaRunningModels(signal) {
        try {
            const res = await fetch(this.endpoint('/api/ps'), { signal });
            if (!res.ok)
                return new Set();
            const data = await res.json();
            return new Set((data.models || []).flatMap((model) => [model.model, model.name].filter(Boolean)));
        }
        catch {
            return new Set();
        }
    }
    async listOpenAIModels(token) {
        const res = await fetch(this.endpoint('/v1/models'), { signal: toAbortSignal(token) });
        if (!res.ok)
            throw new Error(`${this.config.displayName} API error (${res.status})`);
        const data = await res.json();
        return (data.data || []).map((model) => {
            const id = model.id;
            return {
                id,
                localId: id,
                running: true,
                name: id.split('/').pop() || id,
                family: normalizeFamily(id),
                version: id,
                detail: ['Running', this.config.modelDetail].filter(Boolean).join(' - '),
                tooltip: [`${this.config.displayName}`, 'Status: running', `ID: ${id}`].join('\n'),
                maxInputTokens: 32768,
                maxOutputTokens: 8192,
                capabilities: {
                    imageInput: false,
                    toolCalling: 32
                }
            };
        });
    }
    async *ollamaChatStream(model, messages, tools, token) {
        const res = await fetch(this.endpoint('/api/chat'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: messages.map(toOllamaMessage),
                ...(tools.length ? { tools } : {}),
                stream: true
            }),
            signal: toAbortSignal(token)
        });
        if (!res.ok)
            throw new Error(`${this.config.displayName} API error (${res.status})`);
        if (!res.body)
            throw new Error(`${this.config.displayName} returned an empty response body.`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    const parsed = JSON.parse(line);
                    const content = parsed.message?.content || '';
                    if (content)
                        yield { kind: 'text', content };
                    for (const toolCall of toOllamaToolCallParts(parsed.message?.tool_calls)) {
                        yield toolCall;
                    }
                    if (parsed.done) {
                        yield { kind: 'done' };
                        return;
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
        yield { kind: 'done' };
    }
    async *openAIChatStream(model, messages, tools, toolMode, token) {
        const res = await fetch(this.endpoint('/v1/chat/completions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                ...(tools.length ? {
                    tools,
                    tool_choice: toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto'
                } : {}),
                stream: true
            }),
            signal: toAbortSignal(token)
        });
        if (!res.ok)
            throw new Error(`${this.config.displayName} API error (${res.status})`);
        if (!res.body)
            throw new Error(`${this.config.displayName} returned an empty response body.`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const toolCallAccumulator = new Map();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split(/\r?\n\r?\n/);
                buffer = frames.pop() || '';
                for (const frame of frames) {
                    const data = frame
                        .split(/\r?\n/)
                        .filter(line => line.startsWith('data:'))
                        .map(line => line.slice(5).trimStart())
                        .join('\n');
                    if (!data)
                        continue;
                    if (data === '[DONE]') {
                        for (const toolCallPart of flushOpenAIToolCalls(toolCallAccumulator))
                            yield toolCallPart;
                        yield { kind: 'done' };
                        return;
                    }
                    const parsed = JSON.parse(data);
                    const choice = parsed.choices?.[0] || {};
                    const delta = choice.delta || {};
                    const content = delta.content || '';
                    if (content)
                        yield { kind: 'text', content };
                    accumulateOpenAIToolCalls(toolCallAccumulator, delta.tool_calls);
                    if (choice.finish_reason === 'tool_calls') {
                        for (const toolCallPart of flushOpenAIToolCalls(toolCallAccumulator))
                            yield toolCallPart;
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
        for (const toolCallPart of flushOpenAIToolCalls(toolCallAccumulator))
            yield toolCallPart;
        yield { kind: 'done' };
    }
    endpoint(path) {
        const baseUrl = this.configuredBaseUrl();
        let url;
        try {
            url = new URL(baseUrl);
        }
        catch {
            throw new Error(`Invalid ${this.config.baseUrlSetting}. Use a full http:// or https:// URL.`);
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error(`Invalid ${this.config.baseUrlSetting}. Only http:// and https:// endpoints are supported.`);
        }
        if (url.username || url.password) {
            throw new Error(`Invalid ${this.config.baseUrlSetting}. Credentials in local provider URLs are not supported.`);
        }
        if (!isLoopbackHost(url.hostname)) {
            throw new Error(`${this.config.displayName} provider only allows local loopback hosts by default.`);
        }
        const basePath = url.pathname.replace(/\/+$/, '');
        const endpointPath = path.startsWith('/') ? path : `/${path}`;
        url.pathname = `${basePath}${endpointPath}`;
        url.search = '';
        url.hash = '';
        return url.toString();
    }
    configuredBaseUrl() {
        return vscode.workspace.getConfiguration().get(this.config.baseUrlSetting, this.config.defaultBaseUrl).trim();
    }
}
exports.LocalModelLanguageModelProvider = LocalModelLanguageModelProvider;
function createLocalModelProviders() {
    return [
        new LocalModelLanguageModelProvider({
            source: 'ollama',
            vendor: 'ollama',
            displayName: 'Ollama',
            baseUrlSetting: 'localModels.ollamaBaseUrl',
            defaultBaseUrl: 'http://localhost:11434',
            modelDetail: 'Ollama'
        }),
        new LocalModelLanguageModelProvider({
            source: 'openai',
            vendor: 'vllm',
            displayName: 'vLLM',
            baseUrlSetting: 'localModels.vllmBaseUrl',
            defaultBaseUrl: 'http://localhost:8000',
            modelDetail: 'vLLM'
        }),
        new LocalModelLanguageModelProvider({
            source: 'openai',
            vendor: 'llamacpp',
            displayName: 'llama.cpp',
            baseUrlSetting: 'localModels.llamaCppBaseUrl',
            defaultBaseUrl: 'http://localhost:8080',
            modelDetail: 'llama.cpp'
        }),
        new LocalModelLanguageModelProvider({
            source: 'openai',
            vendor: 'llamafile',
            displayName: 'Llamafile',
            baseUrlSetting: 'localModels.llamafileBaseUrl',
            defaultBaseUrl: 'http://localhost:8080',
            modelDetail: 'Llamafile'
        })
    ];
}
function toBackendMessages(messages) {
    const backendMessages = [];
    for (const message of messages) {
        const textParts = [];
        const toolCalls = [];
        const toolResults = [];
        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelTextPart) {
                textParts.push(part.value);
            }
            else if (part instanceof vscode.LanguageModelToolCallPart) {
                toolCalls.push({
                    id: part.callId,
                    type: 'function',
                    function: {
                        name: part.name,
                        arguments: JSON.stringify(part.input || {})
                    }
                });
            }
            else if (part instanceof vscode.LanguageModelToolResultPart) {
                toolResults.push({
                    role: 'tool',
                    tool_call_id: part.callId,
                    content: part.content.map(resultPart => {
                        if (resultPart instanceof vscode.LanguageModelTextPart)
                            return resultPart.value;
                        return '';
                    }).filter(Boolean).join('\n')
                });
            }
        }
        const content = textParts.filter(Boolean).join('\n');
        if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
            backendMessages.push({
                role: 'assistant',
                content,
                ...(toolCalls.length ? { tool_calls: toolCalls } : {})
            });
        }
        else if (content.trim()) {
            backendMessages.push({ role: 'user', content });
        }
        backendMessages.push(...toolResults);
    }
    return backendMessages;
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
        if (part instanceof vscode.LanguageModelToolCallPart) {
            return `${part.name} ${JSON.stringify(part.input || {})}`;
        }
        return '';
    })
        .filter(Boolean)
        .join('\n');
}
function toOpenAITools(tools) {
    return (tools || []).map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema || {
                type: 'object',
                properties: {}
            }
        }
    }));
}
function toOllamaMessage(message) {
    if (message.role === 'tool') {
        return {
            role: 'tool',
            content: message.content || '',
            tool_call_id: message.tool_call_id
        };
    }
    return {
        role: message.role,
        content: message.content || '',
        ...(message.tool_calls?.length ? {
            tool_calls: message.tool_calls.map(toolCall => ({
                function: {
                    name: toolCall.function.name,
                    arguments: parseToolArguments(toolCall.function.arguments)
                }
            }))
        } : {})
    };
}
function toOllamaToolCallParts(toolCalls) {
    if (!Array.isArray(toolCalls))
        return [];
    return toolCalls.map((toolCall, index) => ({
        kind: 'toolCall',
        callId: toolCall.id || `ollama-tool-call-${Date.now()}-${index}`,
        name: toolCall.function?.name || toolCall.name || '',
        input: normalizeToolInput(toolCall.function?.arguments || toolCall.arguments)
    })).filter(toolCall => Boolean(toolCall.name));
}
function accumulateOpenAIToolCalls(accumulator, toolCalls) {
    if (!Array.isArray(toolCalls))
        return;
    for (const toolCall of toolCalls) {
        const index = Number.isInteger(toolCall.index) ? toolCall.index : accumulator.size;
        const current = accumulator.get(index) || { function: { arguments: '' } };
        if (toolCall.id)
            current.id = toolCall.id;
        if (toolCall.type)
            current.type = toolCall.type;
        if (toolCall.function?.name)
            current.function.name = toolCall.function.name;
        if (typeof toolCall.function?.arguments === 'string')
            current.function.arguments += toolCall.function.arguments;
        accumulator.set(index, current);
    }
}
function flushOpenAIToolCalls(accumulator) {
    const parts = [];
    for (const [index, toolCall] of accumulator) {
        if (!toolCall.function.name)
            continue;
        parts.push({
            kind: 'toolCall',
            callId: toolCall.id || `openai-tool-call-${Date.now()}-${index}`,
            name: toolCall.function.name,
            input: parseToolArguments(toolCall.function.arguments)
        });
    }
    accumulator.clear();
    return parts;
}
function normalizeToolInput(input) {
    if (typeof input === 'string')
        return parseToolArguments(input);
    if (input && typeof input === 'object')
        return input;
    return {};
}
function parseToolArguments(value) {
    if (!value.trim())
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        return {};
    }
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
function normalizeFamily(value) {
    const lower = value.toLowerCase();
    if (lower.includes('qwen'))
        return 'qwen';
    if (lower.includes('gemma'))
        return 'gemma';
    if (lower.includes('codestral'))
        return 'codestral';
    if (lower.includes('llama'))
        return 'llama';
    if (lower.includes('mistral'))
        return 'mistral';
    if (lower.includes('phi'))
        return 'phi';
    return lower.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'local';
}
function isLoopbackHost(hostname) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (host === 'localhost' || host === '::1')
        return true;
    const ipv4 = host.split('.').map(part => Number(part));
    return ipv4.length === 4 &&
        ipv4.every(part => Number.isInteger(part) && part >= 0 && part <= 255) &&
        ipv4[0] === 127;
}
//# sourceMappingURL=localModelProvider.js.map