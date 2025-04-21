import * as vscode from 'vscode';
import { toggleTaskState as toggleTask, navigateToTask } from './taskNavigator';
import { rollTasksToToday as rollTasks } from './taskRollover';

/**
 * @deprecated Use toggleTaskState from taskNavigator.ts instead
 */
export async function toggleTaskState(): Promise<void> {
    return toggleTask();
}

/**
 * @deprecated Use rollTasksToToday from taskRollover.ts instead
 */
export async function rollTasksToToday(): Promise<void> {
    return rollTasks();
}

// Export functions from the new files for backwards compatibility
export { navigateToTask };