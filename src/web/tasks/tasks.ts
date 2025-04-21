// Tasks webview script to display and interact with tasks
import * as vscode from 'vscode';
import { Task } from './taskModel';
import { TaskScanner } from './taskScanner';
import { rollTasksToToday } from './taskManager';

/**
 * TasksWebview manages the webview for displaying and interacting with tasks
 */
export class TasksWebview {
    private static instance: TasksWebview | undefined;
    private panel: vscode.WebviewPanel | undefined;
    private taskScanner: TaskScanner;
    private extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];

    private constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.taskScanner = new TaskScanner();
    }

    /**
     * Get singleton instance of TasksWebview
     */
    public static getInstance(extensionUri: vscode.Uri): TasksWebview {
        if (!TasksWebview.instance) {
            TasksWebview.instance = new TasksWebview(extensionUri);
        }
        return TasksWebview.instance;
    }

    /**
     * Initialize and show the tasks webview
     */
    public async showWebview(context: vscode.ExtensionContext): Promise<void> {
        if (this.panel) {
            // If webview already exists, reveal it
            this.panel.reveal();
            return;
        }

        // Create webview panel
        this.panel = vscode.window.createWebviewPanel(
            'calmdown.tasks',
            'Calmdown Tasks',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'src', 'web')
                ]
            }
        );

        // Set webview content
        this.panel.webview.html = await this.getWebviewContent(this.panel.webview, context);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'getTasks':
                    await this.sendTasksToWebview();
                    break;
                case 'navigateToTask':
                    await this.taskScanner.navigateToTask(message.task);
                    break;
                case 'rollTasksToToday':
                    await rollTasksToToday();
                    await this.sendTasksToWebview(); // Refresh tasks after rolling
                    break;
            }
        }, null, this.disposables);

        // Clean up resources when the panel is disposed
        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.disposableAll();
        }, null, this.disposables);

        // Send initial tasks data
        await this.sendTasksToWebview();
    }

    /**
     * Send tasks data to the webview
     */
    private async sendTasksToWebview(): Promise<void> {
        if (!this.panel) {
            return;
        }

        try {
            const tasks = await this.taskScanner.getOpenTasks();
            this.panel.webview.postMessage({
                command: 'tasksData',
                tasks: tasks
            });
        } catch (error) {
            console.error('Error fetching tasks:', error);
            vscode.window.showErrorMessage('Failed to load tasks');
        }
    }

    /**
     * Generate the HTML content for the webview
     */
    private async getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext): Promise<string> {
        // Get paths to the HTML, CSS, and JS files
        const htmlUri = vscode.Uri.joinPath(this.extensionUri, 'src', 'web', 'tasks', 'tasks.html');
        const htmlContent = await this.readFileFromUri(htmlUri);

        // Get URI for styles and scripts
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'web', 'tasks', 'tasks.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'web', 'tasks', 'webview-main.js')
        );

        // Replace placeholders in the HTML with actual URIs
        return htmlContent
            .replace('${cssUri}', stylesUri.toString())
            .replace('${scriptUri}', scriptUri.toString());
    }

    /**
     * Read file content from URI
     */
    private async readFileFromUri(uri: vscode.Uri): Promise<string> {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            return new TextDecoder().decode(content);
        } catch (error) {
            console.error(`Error reading file ${uri.toString()}:`, error);
            throw error;
        }
    }

    /**
     * Dispose of all disposable resources
     */
    private disposableAll() {
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

/**
 * Create a webview-main.js file for client-side scripting
 * This will need to be compiled and bundled
 */
export function createWebviewScript(): string {
    return `
// Client-side webview script
(function() {
    // VS Code webview API
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    const taskList = document.getElementById('taskList');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const refreshButton = document.getElementById('refreshButton');
    const rolloverButton = document.getElementById('rolloverButton');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortBy');
    
    // Task data
    let allTasks = [];
    
    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        // Request initial task data
        requestTasks();
        
        // Set up event listeners
        refreshButton.addEventListener('click', requestTasks);
        rolloverButton.addEventListener('click', rollTasksToToday);
        searchInput.addEventListener('input', filterTasks);
        sortSelect.addEventListener('change', sortTasks);
    });
    
    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'tasksData':
                loadingIndicator.style.display = 'none';
                allTasks = message.tasks;
                renderTasks();
                break;
        }
    });
    
    // Request tasks from extension
    function requestTasks() {
        loadingIndicator.style.display = 'flex';
        vscode.postMessage({ command: 'getTasks' });
    }
    
    // Request task rollover
    function rollTasksToToday() {
        vscode.postMessage({ command: 'rollTasksToToday' });
    }
    
    // Render tasks to the DOM
    function renderTasks() {
        // Clear existing tasks
        while (taskList.firstChild) {
            if (taskList.firstChild !== loadingIndicator) {
                taskList.removeChild(taskList.firstChild);
            }
        }
        
        // Apply current filters
        const filteredTasks = filterAndSortTasks();
        
        if (filteredTasks.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No tasks found';
            taskList.appendChild(emptyMessage);
            return;
        }
        
        // Get the task item template
        const template = document.getElementById('taskItemTemplate');
        
        // Create DOM elements for each task
        filteredTasks.forEach(task => {
            const taskElement = document.importNode(template.content, true).firstElementChild;
            
            // Set task content
            taskElement.querySelector('.task-text').textContent = task.text;
            taskElement.querySelector('.task-priority').textContent = task.priority.toString();
            taskElement.querySelector('.task-difficulty').textContent = task.difficulty.toString();
            
            // Format date
            const date = \`\${task.dueDate.substring(0, 2)}-\${task.dueDate.substring(2, 4)}-\${task.dueDate.substring(4, 6)}\`;
            taskElement.querySelector('.task-date').textContent = date;
            
            // Get filename from path
            const pathParts = task.filePath.split(/[\\/\\\\]/);
            const filename = pathParts[pathParts.length - 1];
            taskElement.querySelector('.task-file').textContent = filename;
            
            // Add priority class
            taskElement.classList.add(\`priority-\${task.priority}\`);
            
            // Add click handler to navigate to task
            taskElement.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'navigateToTask',
                    task: task
                });
            });
            
            taskList.appendChild(taskElement);
        });
    }
    
    // Filter and sort tasks based on current UI state
    function filterAndSortTasks() {
        const searchTerm = searchInput.value.toLowerCase();
        const sortBy = sortSelect.value;
        
        // Filter tasks by search term
        let filtered = allTasks;
        if (searchTerm) {
            filtered = allTasks.filter(task => 
                task.text.toLowerCase().includes(searchTerm)
            );
        }
        
        // Sort tasks
        return filtered.sort((a, b) => {
            switch (sortBy) {
                case 'priority':
                    return b.priority - a.priority; // Higher priority first
                case 'difficulty':
                    return b.difficulty - a.difficulty;
                case 'date':
                    return a.dueDate.localeCompare(b.dueDate);
                default:
                    return 0;
            }
        });
    }
    
    // Filter tasks based on search input
    function filterTasks() {
        renderTasks();
    }
    
    // Sort tasks based on dropdown selection
    function sortTasks() {
        renderTasks();
    }
})();
`;
}