import * as vscode from 'vscode';
import { CalendarViewProvider } from './calendarViewProvider';
import { TasksViewProvider } from './taskViewProvider';
import { toggleTaskState, rollTasksToToday } from './tasks/taskManager';

export function activate(context: vscode.ExtensionContext) {
    // Register both webview providers in the container
    const calendarProvider = new CalendarViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'calmdown.calendarView',
            calendarProvider
        )
    );
    
    const tasksProvider = new TasksViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'calmdown.tasksView',
            tasksProvider
        )
    );

    // Command to focus the extension container
    context.subscriptions.push(
        vscode.commands.registerCommand('calmdown.openCalmdown', () => {
            vscode.commands.executeCommand('workbench.view.extension.calmdown-container');
        })
    );
    
    // Register the toggle task command
    context.subscriptions.push(
        vscode.commands.registerCommand('calmdown.toggleTaskState', toggleTaskState)
    );

    // Register the roll tasks command
    context.subscriptions.push(
        vscode.commands.registerCommand('calmdown.rollTasks', rollTasksToToday)
    );
}

export function deactivate() {}
