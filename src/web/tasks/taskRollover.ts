import * as vscode from 'vscode';
import { Task } from './taskModel';
import { TaskScanner } from './taskScanner';
import { ConfigService } from '../common/configService';
import { handleTaskError } from '../common/errorHandler';
import { formatDateForTask, formatDateYYYYMMDD, getISOWeek, parseTaskDate } from './dateFormatter';
import { createNote } from '../fileManager';
import { findInsertPositionInNote } from './taskNavigator';

/**
 * Roll over all uncompleted tasks from past notes to today's note
 */
export async function rollTasksToToday(): Promise<void> {
    try {
        // Show progress notification
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Rolling tasks to today",
            cancellable: false
        }, async (progress, token) => {
            progress.report({ increment: 10, message: "Finding uncompleted tasks..." });
            
            // Get today's date in YYYY-MM-DD format
            const today = new Date();
            const todayDateStr = formatDateYYYYMMDD(today);
            
            progress.report({ increment: 20, message: "Scanning for tasks..." });
            
            // Scan for all open tasks
            const taskScanner = new TaskScanner();
            const allOpenTasks = await taskScanner.getOpenTasks();
            
            console.log(`Total open tasks found: ${allOpenTasks.length}`);

            // Filter tasks to get only those that are past due or due today
            const pastTasks = filterPastTasks(allOpenTasks, todayDateStr);

            console.log(`Past tasks to roll over: ${pastTasks.length}`);
            if (pastTasks.length === 0) {
                logTaskSamples(allOpenTasks);
                vscode.window.showInformationMessage("No past uncompleted tasks found to roll over.");
                return;
            }
            
            progress.report({ increment: 30, message: `Found ${pastTasks.length} tasks to roll over` });
            
            // Create today's note and prepare path
            await createNote(todayDateStr, undefined);
            const todayFilePath = await buildTodayNotePath(today);
            
            if (!todayFilePath) {
                handleTaskError("Could not determine the path for today's note");
                return;
            }
            
            progress.report({ increment: 40, message: "Opening today's note..." });
            
            const todayDoc = await vscode.workspace.openTextDocument(todayFilePath);
            await vscode.window.showTextDocument(todayDoc);
            
            progress.report({ increment: 50, message: "Moving tasks to today's note..." });
            
            // Group tasks by file for efficient processing
            const tasksByFile = groupTasksByFile(pastTasks);
            
            // Add tasks to today's note
            await addTasksToTodaysNote(todayDoc, pastTasks, todayDateStr);
            
            progress.report({ increment: 70, message: "Marking original tasks as moved..." });
            
            // Mark original tasks as moved
            await markOriginalTasksAsMoved(tasksByFile, todayDateStr);
            
            // Save today's note
            const todayEditor = vscode.window.activeTextEditor;
            if (todayEditor && todayEditor.document.uri.fsPath === todayFilePath.fsPath) {
                await todayEditor.document.save();
            }
            
            progress.report({ increment: 100, message: "Done!" });
            vscode.window.showInformationMessage(`Successfully rolled over ${pastTasks.length} tasks to today's note.`);
        });
    } catch (error) {
        handleTaskError("Failed to roll tasks to today", 
                     error instanceof Error ? error : new Error(String(error)));
    }
}

/**
 * Filter tasks to get only those that are past due or due today
 */
function filterPastTasks(allTasks: Task[], todayDateStr: string): Task[] {
    return allTasks.filter(task => {
        try {
            // Compare due date with today's date
            const dueDate = parseTaskDate(task.dueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Include tasks that are due today or past due
            return dueDate <= today;
        } catch (err) {
            console.error(`Error parsing due date: ${err}`);
            return false;
        }
    });
}

/**
 * Log sample tasks for debugging purposes
 */
function logTaskSamples(tasks: Task[], sampleSize: number = 3): void {
    if (tasks.length > 0) {
        console.log("Sample tasks that were not rolled over:");
        tasks.slice(0, sampleSize).forEach(task => {
            console.log(`- File: ${task.filePath}, Text: ${task.text}`);
        });
    }
}

/**
 * Group tasks by their source file
 */
function groupTasksByFile(tasks: Task[]): Map<string, Task[]> {
    const tasksByFile = new Map<string, Task[]>();
    
    for (const task of tasks) {
        if (!tasksByFile.has(task.filePath)) {
            tasksByFile.set(task.filePath, []);
        }
        tasksByFile.get(task.filePath)!.push(task);
    }
    
    return tasksByFile;
}

/**
 * Add tasks to today's note
 */
async function addTasksToTodaysNote(
    document: vscode.TextDocument, 
    tasks: Task[], 
    todayDateStr: string
): Promise<void> {
    let insertPosition = findInsertPositionInNote(document);
    
    await vscode.window.activeTextEditor?.edit(editBuilder => {
        // First add a heading for rolled over tasks if needed
        if (tasks.length > 0) {
            // Check if the section already exists
            let sectionExists = false;
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                if (line.startsWith('## Rollovered Tasks') || line.startsWith('## Rolled Over Tasks')) {
                    sectionExists = true;
                    break;
                }
            }
            
            if (!sectionExists) {
                editBuilder.insert(
                    insertPosition,
                    `\n## Rollovered Tasks\n\n`
                );
                insertPosition = new vscode.Position(insertPosition.line + 3, 0);
            }
        }
        
        // Add each task
        for (const task of tasks) {
            const taskLine = `-=TODO ${task.priority} ${task.difficulty} ${task.dueDate}=- ${task.text}\n`;
            editBuilder.insert(insertPosition, taskLine);
            insertPosition = new vscode.Position(insertPosition.line + 1, 0);
        }
    });
}

/**
 * Mark original tasks as moved in their source files
 */
async function markOriginalTasksAsMoved(
    tasksByFile: Map<string, Task[]>, 
    todayDateStr: string
): Promise<void> {
    for (const [filePath, tasks] of tasksByFile.entries()) {
        try {
            const fileUri = filePath.startsWith('file:') 
                ? vscode.Uri.parse(filePath) 
                : vscode.Uri.file(filePath);
                
            const sourceDoc = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(sourceDoc);
            
            // Sort tasks by line number in descending order to avoid line number shifts
            tasks.sort((a, b) => b.line - a.line);
            
            await editor.edit(editBuilder => {
                for (const task of tasks) {
                    if (task.line >= 0 && task.line < sourceDoc.lineCount) {
                        const line = sourceDoc.lineAt(task.line);
                        const lineText = line.text;
                        
                        // Replace TODO with ROLL in the task marker
                        const modifiedText = lineText.replace(/-=TODO /, '-=ROLL ');
                        editBuilder.replace(line.range, modifiedText);
                    }
                }
            });
            
            // Save the modified file
            await sourceDoc.save();
        } catch (error) {
            console.error(`Failed to process file ${filePath}: ${error}`);
            vscode.window.showWarningMessage(`Failed to mark tasks as moved in ${filePath}`);
        }
    }
}

/**
 * Build the path to today's note
 */
async function buildTodayNotePath(today: Date): Promise<vscode.Uri | null> {
    const config = ConfigService.getInstance();
    const baseDirectory = config.getJournalFolder();
    
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return null;
    }
    
    const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
    const year = today.getFullYear().toString();
    const monthNumber = (today.getMonth() + 1).toString().padStart(2, '0');
    const monthName = today.toLocaleString('en-US', { month: 'long' });
    const monthFolder = `${monthNumber}-${monthName}`;
    
    // Calculate week number
    const weekNumber = getISOWeek(today).toString().padStart(2, '0');
    
    // Build the path
    const todayDateStr = formatDateYYYYMMDD(today);
    return vscode.Uri.joinPath(
        workspaceFolder,
        baseDirectory,
        year,
        monthFolder,
        `Week-${weekNumber}`,
        `${todayDateStr}.md`
    );
}