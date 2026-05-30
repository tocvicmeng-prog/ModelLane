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
exports.registerInlineCompletion = registerInlineCompletion;
const vscode = __importStar(require("vscode"));
function registerInlineCompletion(context, api) {
    const provider = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, {
        async provideInlineCompletionItems(document, position, _context, token) {
            const enabled = vscode.workspace.getConfiguration('lmstudio').get('enableInlineCompletion', false);
            if (!enabled)
                return;
            if (!vscode.workspace.isTrusted)
                return;
            if (token.isCancellationRequested)
                return;
            if (shouldSkipDocument(document))
                return;
            const linePrefix = document.lineAt(position).text.slice(0, position.character);
            if (linePrefix.trim().length < 3)
                return;
            const beforeCursor = document.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 30), 0), position));
            if (containsSecretLikeContent(beforeCursor))
                return;
            if (token.isCancellationRequested)
                return;
            try {
                const result = await api.chat([
                    {
                        role: 'system',
                        content: 'You are a code completion engine. Complete the code at the cursor. Return ONLY the completion text, no explanations, no markdown. Match the existing indentation and style.'
                    },
                    {
                        role: 'user',
                        content: `Complete the code at <CURSOR>:\n\`\`\`${document.languageId}\n${beforeCursor}<CURSOR>\`\`\``
                    }
                ]);
                if (!result || result.trim().length < 2)
                    return;
                const item = new vscode.InlineCompletionItem(result.trim());
                return [item];
            }
            catch {
                return;
            }
        }
    });
    context.subscriptions.push(provider);
}
function shouldSkipDocument(document) {
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')
        return true;
    const path = document.uri.fsPath.toLowerCase().replace(/\\/g, '/');
    return /(^|\/)\.env($|[./])/.test(path) ||
        /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|known_hosts)$/.test(path) ||
        /(^|\/)(\.npmrc|\.pypirc|\.netrc|credentials|secrets?)(\.|$|\/)/.test(path) ||
        ((/(^|\/)(settings|launch)\.json$/.test(path)) && path.includes('/.vscode/'));
}
function containsSecretLikeContent(text) {
    return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) ||
        /\b(api[_-]?key|secret|token|password|passwd|authorization)\b\s*[:=]/i.test(text) ||
        /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i.test(text);
}
//# sourceMappingURL=inlineCompletion.js.map