import * as vscode from 'vscode';
import { TaskScanner } from './taskScanner';
import { Task } from './taskModel';

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
    const completeRegex = /-=COMPLEATE (\d+) (\d+) (\d+)=-(.*)/;
    
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
        
        newText = `-=COMPLEATE ${priority} ${difficulty} ${dateStr}=-${taskText}`;
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
    
    // Replace the line text
    await editor.edit(editBuilder => {
        const range = line.range;
        editBuilder.replace(range, newText);
    });
}

/**
 * Format date as YYMMDD for task markers
 */
function formatDateForTask(date: Date): string {
    const yy = date.getFullYear().toString().substring(2, 4);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    return `${yy}${mm}${dd}`;
}

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
        }, async (progress) => {
            progress.report({ increment: 10, message: "Finding uncompleted tasks..." });
            
            // Get today's date and file path
            const today = new Date();
            const todayDateStr = formatDateYYYYMMDD(today);
            
            // Get journal folder path from configuration
            const journalFolderPath = await getJournalFolderPath();
            if (!journalFolderPath) {
                vscode.window.showErrorMessage("Journal folder not found. Please set up the correct folder in settings.");
                return;
            }
            
            // Get today's file path
            const todayFilePath = await getTodayFilePath(journalFolderPath, todayDateStr);
            
            progress.report({ increment: 20, message: "Scanning for tasks..." });
            
            // Scan for all open tasks
            const taskScanner = new TaskScanner();
            const allOpenTasks = await taskScanner.getOpenTasks();
            
            // Filter tasks to get only those from past dates (based on file name, not task date)
            const pastTasks = allOpenTasks.filter(task => {
                // Extract date from filename (assuming YYYY-MM-DD.md format)
                const filename = vscode.Uri.file(task.filePath).path.split('/').pop() || '';
                const filenameDate = filename.split('.')[0]; // Remove .md extension
                
                // Compare with today's date string (YYYY-MM-DD format)
                return filenameDate < todayDateStr;
            });
            
            if (pastTasks.length === 0) {
                vscode.window.showInformationMessage("No past uncompleted tasks found to roll over.");
                return;
            }
            
            progress.report({ increment: 30, message: `Found ${pastTasks.length} tasks to roll over` });
            
            // Create or open today's note
            let todayDoc = await createOrOpenTodaysNote(todayFilePath);
            if (!todayDoc) {
                vscode.window.showErrorMessage("Failed to create or open today's note.");
                return;
            }
            
            progress.report({ increment: 40, message: "Moving tasks to today's note..." });
            
            // Group tasks by file for efficient processing
            const tasksByFile = new Map<string, Task[]>();
            for (const task of pastTasks) {
                if (!tasksByFile.has(task.filePath)) {
                    tasksByFile.set(task.filePath, []);
                }
                tasksByFile.get(task.filePath)!.push(task);
            }
            
            // Add tasks to today's note
            let insertPosition = findInsertPositionInNote(todayDoc);
            await vscode.window.showTextDocument(todayDoc);
            
            await vscode.window.activeTextEditor?.edit(editBuilder => {
                // First add a heading for rolled over tasks if needed
                if (pastTasks.length > 0) {
                    editBuilder.insert(
                        insertPosition,
                        `\n## Rolled Over Tasks\n\n`
                    );
                    insertPosition = new vscode.Position(insertPosition.line + 3, 0);
                }
                
                // Add each task
                for (const task of pastTasks) {
                    const taskLine = `-=TODO ${task.priority} ${task.difficulty} ${task.creationDate}=- ${task.text}\n`;
                    editBuilder.insert(insertPosition, taskLine);
                    insertPosition = new vscode.Position(insertPosition.line + 1, 0);
                }
            });
            
            progress.report({ increment: 70, message: "Marking original tasks as moved..." });
            
            // Now handle the original tasks - mark them as moved or delete them
            // Process one file at a time
            for (const [filePath, tasks] of tasksByFile.entries()) {
                const sourceDoc = await vscode.workspace.openTextDocument(filePath);
                const editor = await vscode.window.showTextDocument(sourceDoc);
                
                // Sort tasks by line number in descending order to avoid line number shifts
                tasks.sort((a, b) => b.line - a.line);
                
                await editor.edit(editBuilder => {
                    for (const task of tasks) {
                        const line = sourceDoc.lineAt(task.line);
                        // Replace with a crossed-out version or delete
                        editBuilder.replace(
                            line.range,
                            `~~${line.text}~~ (Rolled to ${todayDateStr})`
                        );
                    }
                });
                
                // Save the modified file
                await sourceDoc.save();
            }
            
            // Save today's note
            const todayEditor = vscode.window.activeTextEditor;
            if (todayEditor && todayEditor.document.uri.fsPath === todayFilePath) {
                await todayEditor.document.save();
            }
            
            progress.report({ increment: 100, message: "Done!" });
            vscode.window.showInformationMessage(`Successfully rolled over ${pastTasks.length} tasks to today's note.`);
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to roll tasks: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Get the journal folder path from configuration
 */
async function getJournalFolderPath(): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('calmdown');
    const baseDirectory = config.get<string>('folderPath') || 'Journal';
    
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return null;
    }
    
    const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
    const journalFolderUri = vscode.Uri.joinPath(workspaceFolder, baseDirectory);
    
    try {
        // Check if the folder exists, create it if not
        try {
            await vscode.workspace.fs.stat(journalFolderUri);
        } catch {
            await vscode.workspace.fs.createDirectory(journalFolderUri);
        }
        
        return journalFolderUri.fsPath;
    } catch {
        return null;
    }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDateYYYYMMDD(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get the file path for today's note
 */
async function getTodayFilePath(journalFolderPath: string, dateStr: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('calmdown');
    const fileNameFormat = config.get<string>('fileNameFormat') || 'YYYY-MM-DD';
    
    // Replace format tokens with actual date parts
    const fileName = `${dateStr}.md`;
    
    const fileUri = vscode.Uri.joinPath(vscode.Uri.file(journalFolderPath), fileName);
    return fileUri.fsPath;
}

/**
 * Create or open today's note
 */
async function createOrOpenTodaysNote(filePath: string): Promise<vscode.TextDocument | null> {
    try {
        // Try to open the file first
        try {
            return await vscode.workspace.openTextDocument(filePath);
        } catch {
            // File doesn't exist, create it
            const fileUri = vscode.Uri.file(filePath);
            
            const today = new Date();
            const dateHeader = formatDateYYYYMMDD(today);
            
            const initialContent = `# ${dateHeader}\n\n`;
            
            const encoder = new TextEncoder();
            const uint8Array = encoder.encode(initialContent);
            await vscode.workspace.fs.writeFile(fileUri, uint8Array);
            
            return await vscode.workspace.openTextDocument(fileUri);
        }
    } catch (error) {
        console.error('Error creating or opening today\'s note:', error);
        return null;
    }
}

/**
 * Find a position to insert content in a note
 * Tries to find the end of the file or after "Rolled Over Tasks" section if it exists
 */
function findInsertPositionInNote(document: vscode.TextDocument): vscode.Position {
    // Look for a "Rolled Over Tasks" section
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.startsWith('## Rolled Over Tasks')) {
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