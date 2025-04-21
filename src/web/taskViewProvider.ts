import * as vscode from 'vscode';

export class TasksViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error || 'Unknown error');
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        try {
            this._view = webviewView;
            
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [this._extensionUri]
            };

            webviewView.webview.html = this._getWebviewContent();
        } catch (error) {
            console.error("Failed to resolve tasks view:", error);
            vscode.window.showErrorMessage(`Failed to load tasks view: ${this.getErrorMessage(error)}`);
        }
    }

    private _getWebviewContent(): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Recent Tasks</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        padding: 10px;
                    }
                    .task-list {
                        margin-top: 10px;
                    }
                    .task-item {
                        padding: 8px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        cursor: pointer;
                    }
                    .task-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    h3 {
                        margin-top: 0;
                    }
                </style>
            </head>
            <body>
                <h3>Recent Tasks</h3>
                <div class="task-list">
                    <div class="task-item">Feature coming soon...</div>
                </div>
                <script>
                    (function() {
                        const vscode = acquireVsCodeApi();
                    })();
                </script>
            </body>
            </html>
        `;
    }
}