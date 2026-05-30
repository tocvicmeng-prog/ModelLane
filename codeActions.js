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
exports.registerCodeActions = registerCodeActions;
const vscode = __importStar(require("vscode"));
const CODE_ACTIONS = [
    {
        command: 'lmstudio.explainCode',
        progressLabel: 'explain',
        systemPrompt: 'Explain the following code in detail. Cover what it does, how it works, and any notable patterns or potential issues.'
    },
    {
        command: 'lmstudio.refactorCode',
        progressLabel: 'refactor',
        systemPrompt: 'Refactor the following code to improve its quality. Focus on readability, performance, and best practices. Return only the refactored code in a code block with a brief explanation.'
    },
    {
        command: 'lmstudio.reviewCode',
        progressLabel: 'review',
        systemPrompt: 'Review the following code for bugs, security issues, performance problems, and style issues. Be specific and actionable.'
    },
    {
        command: 'lmstudio.generateTests',
        progressLabel: 'generate tests',
        systemPrompt: 'Generate comprehensive unit tests for the following code. Use the appropriate testing framework. Return only the test code in a code block.'
    }
];
function registerCodeActions(context, api) {
    for (const action of CODE_ACTIONS) {
        const disposable = vscode.commands.registerCommand(action.command, async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }
            const selection = editor.selection;
            const code = editor.document.getText(selection);
            if (!code) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `ModelLane: ${action.progressLabel}...` }, async () => {
                try {
                    const result = await api.chat([
                        { role: 'system', content: action.systemPrompt },
                        { role: 'user', content: code }
                    ]);
                    const doc = await vscode.workspace.openTextDocument({
                        content: result,
                        language: 'markdown'
                    });
                    vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
                }
                catch (err) {
                    vscode.window.showErrorMessage(`ModelLane error: ${err.message}`);
                }
            });
        });
        context.subscriptions.push(disposable);
    }
    const askDisposable = vscode.commands.registerCommand('lmstudio.askAboutCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const code = editor.document.getText(editor.selection);
        const question = await vscode.window.showInputBox({
            prompt: 'Ask about the selected code',
            placeHolder: 'e.g., "What does this function do?"',
            ignoreFocusOut: true
        });
        if (!question)
            return;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'ModelLane: thinking...' }, async () => {
            try {
                const result = await api.chat([
                    { role: 'system', content: 'Answer the user\'s question about the provided code.' },
                    { role: 'user', content: `Code:\n\`\`\`\n${code}\n\`\`\`\n\nQuestion: ${question}` }
                ]);
                const doc = await vscode.workspace.openTextDocument({
                    content: result,
                    language: 'markdown'
                });
                vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
            }
            catch (err) {
                vscode.window.showErrorMessage(`ModelLane error: ${err.message}`);
            }
        });
    });
    context.subscriptions.push(askDisposable);
}
//# sourceMappingURL=codeActions.js.map