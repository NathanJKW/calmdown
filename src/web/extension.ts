import * as vscode from 'vscode';
import { CalendarViewProvider } from './calendarViewProvider';

export function activate(context: vscode.ExtensionContext) {
    // Register our custom sidebar webview provider
    const calendarProvider = new CalendarViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'calmdown.calendarView',
            calendarProvider
        )
    );

    // Register the command to open the calendar
    context.subscriptions.push(
        vscode.commands.registerCommand('calmdown.openCalendar', () => {
            vscode.commands.executeCommand('workbench.view.extension.calmdown-sidebar');
        })
    );
}

export function deactivate() {}
