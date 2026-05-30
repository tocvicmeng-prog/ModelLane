# ModelLane

**Local models, one lane into VS Code Chat.**

ModelLane is a VS Code extension that exposes local AI model servers through the built-in VS Code Chat model picker. It gathers callable local models under one provider:

```text
Auto -> Other Models -> ModelLane -> ready local models
```

Supported sources:

- LM Studio
- Ollama
- vLLM
- llama.cpp
- Llamafile

ModelLane is MIT licensed. Software owner: **Tocvic M**.

## Highlights

- One `ModelLane` provider in VS Code Chat instead of separate provider clutter.
- Clickable status bar button: `ModelLane Refresh`.
- One command to probe every supported local platform: `ModelLane: Sense and Refresh Installed Models`.
- Only loaded/running models are shown in the built-in picker.
- Loopback-only local model URLs by default.
- Optional LM Studio-backed side chat panel with local agent tools.

## Install

Download the latest `.vsix` from the GitHub Releases page, then install it from PowerShell:

```powershell
code --install-extension .\modellane-0.5.0.vsix --force
```

Reload VS Code after installation:

```text
Developer: Reload Window
```

If you previously installed the old local test build, remove it once:

```powershell
code --uninstall-extension lmstudio-agent.lmstudio-vscode-agent
```

## Quick Start

1. Start at least one local model server, for example LM Studio at `http://localhost:1234`.
2. In VS Code, click the `ModelLane Refresh` status bar item, or run:

   ```text
   ModelLane: Sense and Refresh Installed Models
   ```

3. Open VS Code Chat.
4. Click the model selector currently showing `Auto`.
5. Expand `Other Models`.
6. Expand `ModelLane`.
7. Select a ready local model and send a prompt.

If the picker was already open, close and reopen it after refreshing. VS Code can cache the model list while the picker is open.

## Supported Local Sources

| Source | Default URL | Discovery endpoint | Chat endpoint |
| --- | --- | --- | --- |
| LM Studio | `http://localhost:1234` | `/api/v1/models` | `/api/v1/chat` |
| Ollama | `http://localhost:11434` | `/api/tags`, `/api/ps` | `/api/chat` |
| vLLM | `http://localhost:8000` | `/v1/models` | `/v1/chat/completions` |
| llama.cpp | `http://localhost:8080` | `/v1/models` | `/v1/chat/completions` |
| Llamafile | `http://localhost:8080` | `/v1/models` | `/v1/chat/completions` |

llama.cpp and Llamafile often use the same default port. If you run both at the same time, set one of them to a different port and update the matching extension setting.

## First-Time Setup

### LM Studio

1. Open LM Studio.
2. Load a chat model.
3. Start the local server on `http://localhost:1234`.
4. Run `ModelLane: Sense and Refresh Installed Models`.

ModelLane defaults to LM Studio's native v1 REST API. To use LM Studio's OpenAI-compatible endpoints instead:

```json
{
  "lmstudio.apiMode": "openai"
}
```

### Ollama

Start Ollama and make sure at least one model is installed:

```powershell
ollama pull llama3.1
ollama run llama3.1
```

ModelLane reads installed models from `http://localhost:11434/api/tags` and running models from `http://localhost:11434/api/ps`.

### vLLM

Start vLLM's OpenAI-compatible server:

```powershell
python -m vllm.entrypoints.openai.api_server --model <model-id> --host 127.0.0.1 --port 8000
```

Then run `ModelLane: Sense and Refresh Installed Models`.

### llama.cpp

Start `llama-server` with a GGUF model:

```powershell
llama-server -m C:\path\to\model.gguf --host 127.0.0.1 --port 8080
```

### Llamafile

Start your `.llamafile` server. If you also use llama.cpp on port `8080`, choose another port such as `8081`:

```powershell
.\your-model.llamafile --host 127.0.0.1 --port 8081
```

Then update:

```json
{
  "localModels.llamafileBaseUrl": "http://localhost:8081"
}
```

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `lmstudio.baseUrl` | `http://localhost:1234` | LM Studio server URL |
| `lmstudio.apiMode` | `native` | `native` LM Studio v1 endpoints or `openai` compatibility endpoints |
| `lmstudio.model` | empty | Optional pinned LM Studio model ID for the side chat panel |
| `lmstudio.enableInlineCompletion` | `false` | Opt-in inline completion |
| `lmstudio.agent.maxIterations` | `6` | Maximum side-panel agent tool-use steps |
| `localModels.ollamaBaseUrl` | `http://localhost:11434` | Ollama server URL |
| `localModels.vllmBaseUrl` | `http://localhost:8000` | vLLM OpenAI-compatible server URL |
| `localModels.llamaCppBaseUrl` | `http://localhost:8080` | llama.cpp OpenAI-compatible server URL |
| `localModels.llamafileBaseUrl` | `http://localhost:8080` | Llamafile OpenAI-compatible server URL |

All local model provider URLs are restricted to loopback hosts by default.

## Commands

| Command | What it does |
| --- | --- |
| `ModelLane: Sense and Refresh Installed Models` | Probes all supported local platforms, refreshes the VS Code model picker, and reports model counts |
| `ModelLane: Refresh Built-in Chat Models` | Fires a lightweight picker refresh |
| `ModelLane: Open Chat` | Opens ModelLane's LM Studio-backed side chat panel |
| `ModelLane: Select LM Studio Model` | Chooses the LM Studio model used by the side chat panel |
| `ModelLane: Diagnostics` | Shows installed version, API mode, URL, model, and install path |
| `ModelLane: Refresh Status Bar` | Recreates the ModelLane status bar state |

## Model Picker Behavior

ModelLane contributes only models that are currently loaded/running and callable. Installed-but-not-loaded LM Studio models are hidden from the built-in VS Code Chat picker until you load them in LM Studio.

Ready models are marked with a leading `✓`. VS Code does not currently let extensions color individual rows in the built-in `Auto` picker, so ModelLane uses symbols and metadata instead of custom colors.

The visible refresh button is the `$(sync) ModelLane Refresh` status bar item. Click it to run `ModelLane: Sense and Refresh Installed Models`. The provider management command is also wired to the same scan/refresh command wherever VS Code exposes provider management UI.

## Privacy Notes

By default, requests are allowed only to loopback hosts such as `localhost`, `127.0.0.1`, and `[::1]`.

The LM Studio provider refuses to send prompts or code context to non-local LM Studio hosts unless both `lmstudio.baseUrl` and `lmstudio.allowRemoteBaseUrl` are set in user settings.

Inline completion is disabled by default. When enabled, it can send recent code around the cursor to the configured LM Studio API. It is also disabled in untrusted workspaces and skips common secret-bearing files such as `.env`, `.npmrc`, private key files, and VS Code workspace settings.

Code actions send only the selected text to the configured API when the user explicitly invokes an action.

Agent mode in the side chat panel can list files, read files, search text, and request edits inside the current workspace. It is disabled in untrusted workspaces, blocks common secret-bearing paths, and asks for confirmation before creating or modifying files.

## FAQ

### Why do I not see ModelLane in the Auto picker?

Run `ModelLane: Sense and Refresh Installed Models`, then close and reopen the picker. ModelLane appears under `Other Models`.

### Why do I not see a model I installed in LM Studio?

ModelLane shows only models that are loaded and callable. Load the model in LM Studio, then click `ModelLane Refresh`.

### Why does the status bar say a server is reachable but the picker still looks unchanged?

The status bar and the VS Code Chat picker are separate UI surfaces. The status bar can update immediately, while the picker may need to be reopened. In stubborn cases, run `Developer: Reload Window`.

### Can ModelLane make running models light green in the picker?

No. VS Code's language model provider API allows extensions to provide names, details, tooltips, and capabilities, but it does not expose per-row styling for the built-in model picker.

### Does Agent mode work exactly like Claude Code?

No. ModelLane makes local models available inside VS Code Chat and provides a local agent loop in its own side chat panel, but final behavior depends on the local model and server. Tool calling is best with models that were trained for tool use and servers that implement OpenAI/Ollama tool-call streaming reliably.

### Is any code sent to the internet?

Not by default. The local providers only allow loopback URLs. The exception is if you deliberately configure LM Studio to allow a remote base URL using the remote opt-in setting.

### How do I confirm the local API works outside VS Code?

Use these checks:

```powershell
curl http://localhost:1234/api/v1/models
curl http://localhost:11434/api/tags
curl http://localhost:8000/v1/models
curl http://localhost:8080/v1/models
```

If `curl` cannot reach the server, VS Code cannot reach it either.

## Development

```powershell
npm install
npm run compile
npx --yes @vscode/vsce package --no-dependencies --allow-missing-repository
```

The generated `.vsix` can be installed locally with:

```powershell
code --install-extension .\modellane-0.5.0.vsix --force
```

## License

MIT. Copyright (c) 2026 Tocvic M.

## References

- LM Studio REST API: https://lmstudio.ai/docs/developer/rest
- Ollama API: https://docs.ollama.com/api
- vLLM OpenAI-compatible server: https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/
- llama.cpp server: https://github.com/ggml-org/llama.cpp
- Llamafile project: https://github.com/Mozilla-Ocho/llamafile
