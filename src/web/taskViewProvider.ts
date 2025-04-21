import * as vscode from 'vscode';
import { TaskScanner } from './tasks/taskScanner';
import { Task } from './tasks/taskModel';

export class TasksViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private taskScanner: TaskScanner;
    
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this.taskScanner = new TaskScanner();
        
        // Register command to refresh tasks
        this._context.subscriptions.push(
            vscode.commands.registerCommand('calmdown.refreshTasks', () => {
                this.refreshTasks();
            })
        );
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error || 'Unknown error');
    }
    
    private async refreshTasks(): Promise<void> {
        if (this._view) {
            // Show loading state
            this._view.webview.postMessage({ command: 'setLoading', value: true });
            
            try {
                const tasks = await this.taskScanner.getOpenTasks();
                this._view.webview.postMessage({ 
                    command: 'updateTasks',
                    tasks: tasks.map(task => ({
                        text: task.text,
                        priority: task.priority,
                        difficulty: task.difficulty,
                        date: task.creationDate,
                        filePath: task.filePath,
                        line: task.line
                    }))
                });
            } catch (error) {
                console.error("Error refreshing tasks:", error);
                this._view.webview.postMessage({ 
                    command: 'error',
                    message: `Failed to load tasks: ${this.getErrorMessage(error)}`
                });
            } finally {
                this._view.webview.postMessage({ command: 'setLoading', value: false });
            }
        }
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

            // Load HTML content
            webviewView.webview.html = this._getWebviewContent();
            
            // Handle messages from webview
            webviewView.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'refreshTasks':
                            await this.refreshTasks();
                            break;
                            
                        case 'rollTasks':
                            // Execute roll tasks command
                            vscode.commands.executeCommand('calmdown.rollTasks');
                            break;
                            
                        case 'openTask':
                            const task: Task = {
                                text: message.task.text,
                                priority: message.task.priority, 
                                difficulty: message.task.difficulty,
                                creationDate: message.task.date,
                                filePath: message.task.filePath,
                                line: message.task.line,
                                status: 'TODO'
                            };
                            await this.taskScanner.navigateToTask(task);
                            break;
                    }
                },
                undefined,
                this._context.subscriptions
            );
            
            // Initial task load
            this.refreshTasks();
            
            // Set up refresh interval (every 5 minutes)
            const refreshInterval = setInterval(() => {
                if (this._view?.visible) {
                    this.refreshTasks();
                }
            }, 5 * 60 * 1000);
            
            // Clean up interval when webview is disposed
            webviewView.onDidDispose(() => {
                clearInterval(refreshInterval);
            });
            
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
                <title>Open Tasks</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        padding: 10px;
                        font-size: 13px;
                    }
                    
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                    }
                    
                    h3 {
                        margin: 0;
                    }
                    
                    .header-buttons {
                        display: flex;
                        gap: 4px;
                    }
                    
                    .refresh-btn, .roll-btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 4px 8px;
                        border-radius: 2px;
                        cursor: pointer;
                        font-size: 11px;
                    }
                    
                    .refresh-btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    
                    .roll-btn {
                        background: var(--vscode-button-secondaryBackground, #5a5a5a);
                        color: var(--vscode-button-secondaryForeground, #ffffff);
                        border: none;
                        padding: 4px 8px;
                        border-radius: 2px;
                        cursor: pointer;
                        font-size: 11px;
                    }
                    
                    .roll-btn:hover {
                        background: var(--vscode-button-secondaryHoverBackground);
                    }
                    
                    .task-list {
                        margin-top: 10px;
                        max-height: calc(100vh - 80px);
                        overflow-y: auto;
                    }
                    
                    .task-item {
                        padding: 8px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        cursor: pointer;
                        position: relative;
                    }
                    
                    .task-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    
                    .task-text {
                        word-break: break-word;
                        padding-right: 45px;
                    }
                    
                    .task-meta {
                        font-size: 10px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 4px;
                    }
                    
                    .priority {
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        color: var(--vscode-editorInfo-foreground);
                        font-weight: bold;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 3px;
                        padding: 1px 4px;
                        font-size: 10px;
                    }
                    
                    .priority-1 { color: var(--vscode-editorInfo-foreground); }
                    .priority-2 { color: var(--vscode-editorWarning-foreground); }
                    .priority-3 { color: var(--vscode-editorError-foreground); }
                    
                    .loading {
                        text-align: center;
                        margin: 20px 0;
                        font-style: italic;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .empty-state {
                        text-align: center;
                        margin: 20px 0;
                        color: var(--vscode-descriptionForeground);
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3>Open Tasks</h3>
                    <div class="header-buttons">
                        <button class="roll-btn" id="roll-btn">Roll to Today</button>
                        <button class="refresh-btn" id="refresh-btn">Refresh</button>
                    </div>
                </div>
                
                <div id="loading" class="loading" style="display: none;">
                    Loading tasks...
                </div>
                
                <div id="task-list" class="task-list">
                    <div class="empty-state" id="empty-state">
                        No open tasks found
                    </div>
                </div>
                
                <script>
                    (function() {
                        const vscode = acquireVsCodeApi();
                        const taskList = document.getElementById('task-list');
                        const emptyState = document.getElementById('empty-state');
                        const loadingIndicator = document.getElementById('loading');
                        const refreshButton = document.getElementById('refresh-btn');
                        const rollButton = document.getElementById('roll-btn');
                        
                        let tasks = [];
                        
                        // Handle messages from extension
                        window.addEventListener('message', event => {
                            const message = event.data;
                            
                            switch (message.command) {
                                case 'updateTasks':
                                    tasks = message.tasks || [];
                                    renderTasks();
                                    break;
                                    
                                case 'setLoading':
                                    loadingIndicator.style.display = message.value ? 'block' : 'none';
                                    break;
                                    
                                case 'error':
                                    showError(message.message);
                                    break;
                            }
                        });
                        
                        // Request refresh on button click
                        refreshButton.addEventListener('click', () => {
                            vscode.postMessage({ command: 'refreshTasks' });
                        });
                        
                        // Roll tasks on button click
                        rollButton.addEventListener('click', () => {
                            vscode.postMessage({ command: 'rollTasks' });
                        });
                        
                        function renderTasks() {
                            // Clear existing tasks except empty state
                            while (taskList.firstChild) {
                                taskList.removeChild(taskList.firstChild);
                            }
                            
                            if (tasks.length === 0) {
                                taskList.appendChild(emptyState);
                                return;
                            }
                            
                            // Sort tasks by priority (higher first), then by date (newer first)
                            tasks.sort((a, b) => {
                                if (a.priority !== b.priority) {
                                    return b.priority - a.priority;
                                }
                                
                                // Compare dates in reverse (assuming YYMMDD format)
                                return b.date.localeCompare(a.date);
                            });
                            
                            // Render tasks
                            tasks.forEach(task => {
                                const taskItem = document.createElement('div');
                                taskItem.className = 'task-item';
                                taskItem.dataset.filePath = task.filePath;
                                taskItem.dataset.line = task.line;
                                
                                const priority = document.createElement('div');
                                priority.className = 'priority priority-' + task.priority;
                                priority.textContent = 'P' + task.priority;
                                
                                const taskText = document.createElement('div');
                                taskText.className = 'task-text';
                                taskText.textContent = task.text || '(No description)';
                                
                                const taskMeta = document.createElement('div');
                                taskMeta.className = 'task-meta';
                                
                                // Format date as YY-MM-DD
                                const dateStr = task.date || '';
                                const formattedDate = dateStr.length === 6 ? 
                                    \`\${dateStr.substring(0, 2)}-\${dateStr.substring(2, 4)}-\${dateStr.substring(4, 6)}\` : 
                                    dateStr;
                                    
                                taskMeta.textContent = \`Created: \${formattedDate} • Difficulty: \${task.difficulty}\`;
                                
                                taskItem.appendChild(priority);
                                taskItem.appendChild(taskText);
                                taskItem.appendChild(taskMeta);
                                
                                taskItem.addEventListener('click', () => {
                                    vscode.postMessage({ 
                                        command: 'openTask', 
                                        task
                                    });
                                });
                                
                                taskList.appendChild(taskItem);
                            });
                        }
                        
                        function showError(message) {
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'empty-state';
                            errorDiv.textContent = message || 'An error occurred';
                            
                            while (taskList.firstChild) {
                                taskList.removeChild(taskList.firstChild);
                            }
                            
                            taskList.appendChild(errorDiv);
                        }
                        
                        // Initial load - request tasks
                        vscode.postMessage({ command: 'refreshTasks' });
                    })();
                </script>
            </body>
            </html>
        `;
    }
}