import * as vscode from 'vscode';
import { createNote, checkNotesExist } from './fileManager';

export class CalendarViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) { }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error || 'Unknown error');
    }

    public resolveWebviewView(
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

            webviewView.webview.html = this._getWebviewContent(webviewView.webview);

            // Handle messages from the webview
            webviewView.webview.onDidReceiveMessage(
                async message => {
                    try {
                        switch (message.command) {
                            case 'dateClicked':
                                await createNote(message.date, this._context);
                                // After creating a note, tell calendar to refresh indicators
                                webviewView.webview.postMessage({ command: 'refreshIndicators' });
                                break;
                            case 'checkDates':
                                const existingNotes = await checkNotesExist(message.dates);
                                webviewView.webview.postMessage({ 
                                    command: 'existingNotes',
                                    dates: existingNotes
                                });
                                break;
                            case 'resourceError':
                                vscode.window.showErrorMessage(
                                    `Calendar ${message.type} resources failed to load. Try reloading the extension.`
                                );
                                break;
                            case 'error':
                                vscode.window.showErrorMessage(`Calendar error: ${message.message}`);
                                break;
                        }
                    } catch (error) {
                        console.error("Error processing webview message:", error);
                        vscode.window.showErrorMessage(`Error in calendar view: ${this.getErrorMessage(error)}`);
                    }
                },
                undefined,
                []
            );
        } catch (error) {
            console.error("Failed to resolve webview:", error);
            vscode.window.showErrorMessage(`Failed to load calendar: ${this.getErrorMessage(error)}`);
        }
    }

    private _getWebviewContent(webview: vscode.Webview): string {
        try {
            // Get paths to style and script files
            const cssPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'web', 'calendar', 'calendar.css');
            const jsPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'web', 'calendar', 'calendar.js');

            // Verify resources exist (for browser extension we can't directly check files)
            // Instead, we'll handle potential loading errors in the HTML

            // Convert to webview URIs
            const cssUri = webview.asWebviewUri(cssPath);
            const jsUri = webview.asWebviewUri(jsPath);
            
            // Create HTML with error handling for resource loading
            return `<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Calmdown Calendar</title>
                    <link rel="stylesheet" href="${cssUri}" onerror="resourceLoadError('CSS')">
                    <style>
                        .error-container {
                            color: var(--vscode-errorForeground);
                            padding: 20px;
                            text-align: center;
                            display: none;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="calendar-header">
                            <button id="prev-month">&lt;</button>
                            <div class="month-year" id="month-year">April 2025</div>
                            <button id="next-month">&gt;</button>
                        </div>
                        <div class="calendar" id="calendar">
                            <!-- Calendar will be generated by JS -->
                        </div>
                    </div>
                    <div id="error-container" class="error-container">
                        <h3>Failed to load calendar resources</h3>
                        <p id="error-message"></p>
                        <button onclick="retryLoading()">Retry</button>
                    </div>
                    <script>
                        function resourceLoadError(type) {
                            document.getElementById('error-container').style.display = 'block';
                            document.getElementById('error-message').textContent = type + ' resources failed to load.';
                            document.querySelector('.container').style.display = 'none';
                            
                            // Notify extension of the error
                            const vscode = acquireVsCodeApi();
                            vscode.postMessage({ 
                                command: 'resourceError', 
                                type: type 
                            });
                        }
                        
                        function retryLoading() {
                            window.location.reload();
                        }
                    </script>
                    <script src="${jsUri}" onerror="resourceLoadError('JavaScript')"></script>
                </body>
                </html>`;
        } catch (error) {
            console.error("Error generating webview content:", error);
            return `
                <html>
                    <body>
                        <h3>Failed to initialize calendar view</h3>
                        <p>Error: ${this.getErrorMessage(error)}</p>
                    </body>
                </html>`;
        }
    }
}