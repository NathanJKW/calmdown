import * as vscode from 'vscode';

export interface Task {
    text: string;
    priority: number;
    difficulty: number;
    dueDate: string;  // Changed from creationDate to dueDate
    filePath: string;
    line: number;
    status: 'TODO' | 'COMPLETE';
}

export function parseTask(line: string, filePath: string, lineNumber: number): Task | null {
    // Regex patterns for task markers
    const todoRegex = /-=TODO (\d+) (\d+) (\d+)=-(.*)/;
    const completeRegex = /-=COMPLETE (\d+) (\d+) (\d+)=-(.*)/;
    // Ignoring ROLL tasks as they're rolled over to other files
    
    let match = line.match(todoRegex);
    if (match) {
        return {
            text: match[4].trim(),
            priority: parseInt(match[1]),
            difficulty: parseInt(match[2]),
            dueDate: match[3],  // This is now properly labeled as dueDate
            filePath,
            line: lineNumber,
            status: 'TODO'
        };
    }
    
    match = line.match(completeRegex);
    if (match) {
        return {
            text: match[4].trim(),
            priority: parseInt(match[1]),
            difficulty: parseInt(match[2]),
            dueDate: match[3],  // This is now properly labeled as dueDate
            filePath,
            line: lineNumber,
            status: 'COMPLETE'
        };
    }
    
    return null;
}