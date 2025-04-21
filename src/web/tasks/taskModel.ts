import * as vscode from 'vscode';

export interface Task {
    text: string;
    priority: number;
    difficulty: number;
    creationDate: string;
    filePath: string;
    line: number;
    status: 'TODO' | 'COMPLEATE';
}

export function parseTask(line: string, filePath: string, lineNumber: number): Task | null {
    // Regex patterns for task markers
    const todoRegex = /-=TODO (\d+) (\d+) (\d+)=-(.*)/;
    const completeRegex = /-=COMPLEATE (\d+) (\d+) (\d+)=-(.*)/;
    
    let match = line.match(todoRegex);
    if (match) {
        return {
            text: match[4].trim(),
            priority: parseInt(match[1]),
            difficulty: parseInt(match[2]),
            creationDate: match[3],
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
            creationDate: match[3],
            filePath,
            line: lineNumber,
            status: 'COMPLEATE'
        };
    }
    
    return null;
}