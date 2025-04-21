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

            // Now we need to await the content
            webviewView.webview.html = await this._getWebviewContent(webviewView.webview);

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

    private async _getWebviewContent(webview: vscode.Webview): Promise<string> {
        try {
            // Get paths to resources
            const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'web', 'calendar', 'calendar.html');
            const cssPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'web', 'calendar', 'calendar.css');
            const jsPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'web', 'calendar', 'calendar.js');

            // Convert to webview URIs
            const cssUri = webview.asWebviewUri(cssPath);
            const jsUri = webview.asWebviewUri(jsPath);
            
            // Read HTML file using vscode.workspace.fs API
            const htmlContent = await vscode.workspace.fs.readFile(htmlPath);
            let html = new TextDecoder().decode(htmlContent);
            
            html = html.replace('${cssUri}', cssUri.toString());
            html = html.replace('${jsUri}', jsUri.toString());
            
            return html;
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