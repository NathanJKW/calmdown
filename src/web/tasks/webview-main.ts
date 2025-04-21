interface Task {
    text: string;
    priority: number;
    difficulty: number;
    dueDate: string;  // Changed from creationDate to dueDate
    filePath: string;
    line: number;
    status: 'TODO' | 'COMPLETE';
}

// VS Code webview API
declare function acquireVsCodeApi(): {
    postMessage: (message: any) => void;
    getState: () => any;
    setState: (state: any) => void;
};

const vscode = acquireVsCodeApi();

// DOM elements
let taskList: HTMLElement;
let loadingIndicator: HTMLElement;
let refreshButton: HTMLElement;
let rolloverButton: HTMLElement;
let searchInput: HTMLInputElement;
let sortSelect: HTMLSelectElement;

// Task data
let allTasks: Task[] = [];

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    taskList = document.getElementById('taskList')!;
    loadingIndicator = document.getElementById('loadingIndicator')!;
    refreshButton = document.getElementById('refreshButton')!;
    rolloverButton = document.getElementById('rolloverButton')!;
    searchInput = document.getElementById('searchInput') as HTMLInputElement;
    sortSelect = document.getElementById('sortBy') as HTMLSelectElement;
    
    // Request initial task data
    requestTasks();
    
    // Set up event listeners
    refreshButton.addEventListener('click', requestTasks);
    rolloverButton.addEventListener('click', rollTasksToToday);
    searchInput.addEventListener('input', filterTasks);
    sortSelect.addEventListener('change', sortTasks);
    
    // Restore any saved state
    restoreState();
});

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'tasksData':
            loadingIndicator.style.display = 'none';
            allTasks = message.tasks;
            saveState();
            renderTasks();
            break;
    }
});

// Request tasks from extension
function requestTasks(): void {
    loadingIndicator.style.display = 'flex';
    vscode.postMessage({ command: 'getTasks' });
}

// Request task rollover
function rollTasksToToday(): void {
    vscode.postMessage({ command: 'rollTasksToToday' });
}

// Save current state
function saveState(): void {
    const state = {
        tasks: allTasks,
        searchTerm: searchInput.value,
        sortBy: sortSelect.value
    };
    vscode.setState(state);
}

// Restore saved state
function restoreState(): void {
    const state = vscode.getState();
    if (state) {
        allTasks = state.tasks || [];
        if (state.searchTerm) {
            searchInput.value = state.searchTerm;
        }
        if (state.sortBy) {
            sortSelect.value = state.sortBy;
        }
        renderTasks();
    }
}

// Render tasks to the DOM
function renderTasks(): void {
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
    const template = document.getElementById('taskItemTemplate') as HTMLTemplateElement;
    
    // Create DOM elements for each task
    filteredTasks.forEach(task => {
        const taskElement = document.importNode(template.content, true).firstElementChild as HTMLElement;
        
        // Set task content
        const taskTextEl = taskElement.querySelector('.task-text') as HTMLElement;
        taskTextEl.textContent = task.text;
        
        const taskPriorityEl = taskElement.querySelector('.task-priority') as HTMLElement;
        taskPriorityEl.textContent = task.priority.toString();
        
        const taskDifficultyEl = taskElement.querySelector('.task-difficulty') as HTMLElement;
        taskDifficultyEl.textContent = task.difficulty.toString();
        
        // Format date
        const date = `${task.dueDate.substring(0, 2)}-${task.dueDate.substring(2, 4)}-${task.dueDate.substring(4, 6)}`;
        const taskDateEl = taskElement.querySelector('.task-date') as HTMLElement;
        taskDateEl.textContent = date;
        
        // Get filename from path
        const pathParts = task.filePath.split(/[\/\\]/);
        const filename = pathParts[pathParts.length - 1];
        const taskFileEl = taskElement.querySelector('.task-file') as HTMLElement;
        taskFileEl.textContent = filename;
        
        // Add priority class
        taskElement.classList.add(`priority-${task.priority}`);
        
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
function filterAndSortTasks(): Task[] {
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
function filterTasks(): void {
    saveState();
    renderTasks();
}

// Sort tasks based on dropdown selection
function sortTasks(): void {
    saveState();
    renderTasks();
}