import * as vscode from 'vscode';
import { Task } from './taskModel';
import { formatDateForTask } from './dateFormatter';
import { handleTaskError } from '../common/errorHandler';

/**
 * Toggles a task state in a markdown document
 * - Adds a task marker to empty lines
 * - Toggles between TODO and COMPLETE on existing task lines
 * - Preserves task details
 */
export async function toggleTaskState(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;
    
    // Regex patterns for task markers
    const todoRegex = /-=TODO (\d+) (\d+) (\d+)=-(.*)/;
    const completeRegex = /-=COMPLETE (\d+) (\d+) (\d+)=-(.*)/;
    
    let newText: string;
    
    const todoMatch = lineText.match(todoRegex);
    const completeMatch = lineText.match(completeRegex);
    
    if (todoMatch) {
        // Convert TODO to COMPLETE with today's date
        const priority = todoMatch[1];
        const difficulty = todoMatch[2];
        const taskText = todoMatch[4];
        
        const today = new Date();
        const dateStr = formatDateForTask(today);
        
        newText = `-=COMPLETE ${priority} ${difficulty} ${dateStr}=-${taskText}`;
    } else if (completeMatch) {
        // Convert COMPLETE back to TODO with original date
        const priority = completeMatch[1];
        const difficulty = completeMatch[2];
        const origDate = completeMatch[3]; // Keep the original date
        const taskText = completeMatch[4];
        
        newText = `-=TODO ${priority} ${difficulty} ${origDate}=-${taskText}`;
    } else {
        // No task marker found, insert new TODO
        const today = new Date();
        const dateStr = formatDateForTask(today);
        
        if (lineText.trim() === '') {
            // Empty line
            newText = `-=TODO 1 1 ${dateStr}=-`;
        } else {
            // Line has content but no task marker
            newText = `-=TODO 1 1 ${dateStr}=- ${lineText}`;
        }
    }
    
    try {
        // Replace the line text
        await editor.edit(editBuilder => {
            const range = line.range;
            editBuilder.replace(range, newText);
        });
    } catch (error) {
        handleTaskError('Failed to toggle task state', error instanceof Error ? error : new Error(String(error)));
    }
}

/**
 * Navigate to a specific task location in its file
 */
export async function navigateToTask(task: Task): Promise<void> {
    try {
        const document = await vscode.workspace.openTextDocument(task.filePath);
        const editor = await vscode.window.showTextDocument(document);
        
        const position = new vscode.Position(task.line, 0);
        const selection = new vscode.Selection(position, position);
        
        editor.selection = selection;
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    } catch (err) {
        handleTaskError(`Could not navigate to task in ${task.filePath}`, 
                      err instanceof Error ? err : new Error(String(err)));
    }
}

/**
 * Find a position to insert content in a note
 */
export function findInsertPositionInNote(document: vscode.TextDocument): vscode.Position {
    // Look for a "Rolled Over Tasks" section (either format)
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.startsWith('## Rolled Over Tasks') || line.startsWith('## Rollovered Tasks')) {
            // Find the next section or end of file
            for (let j = i + 1; j < document.lineCount; j++) {
                const nextLine = document.lineAt(j).text;
                if (nextLine.startsWith('## ')) {
                    // Found next section, insert before it
                    return new vscode.Position(j, 0);
                }
            }
            // No next section found, append to the end of file
            return new vscode.Position(document.lineCount, 0);
        }
    }
    
    // No "Rolled Over Tasks" section found, add after first heading
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.startsWith('# ')) {
            // Find the first empty line after the heading
            for (let j = i + 1; j < document.lineCount; j++) {
                const nextLine = document.lineAt(j).text;
                if (nextLine.trim() === '') {
                    return new vscode.Position(j, 0);
                }
            }
            // No empty line found, insert after the heading
            return new vscode.Position(i + 1, 0);
        }
    }
    
    // No heading found, insert at the end of file
    return new vscode.Position(document.lineCount, 0);
}