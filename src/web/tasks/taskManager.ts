import * as vscode from 'vscode';

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