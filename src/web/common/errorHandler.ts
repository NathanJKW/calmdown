import * as vscode from 'vscode';

export enum ErrorSeverity {
    Info,
    Warning,
    Error,
    Fatal
}

interface ErrorDetails {
    message: string;
    severity: ErrorSeverity;
    source?: string;
    originalError?: Error;
}

export class ErrorHandler {
    private static instance: ErrorHandler;
    private errorLog: ErrorDetails[] = [];
    
    private constructor() {}
    
    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }
    
    /**
     * Handle an error with appropriate messaging and logging
     */
    public handleError(details: ErrorDetails): void {
        // Log the error
        this.logError(details);
        
        // Display appropriate message to user based on severity
        switch (details.severity) {
            case ErrorSeverity.Info:
                vscode.window.showInformationMessage(details.message);
                break;
            case ErrorSeverity.Warning:
                vscode.window.showWarningMessage(details.message);
                break;
            case ErrorSeverity.Error:
            case ErrorSeverity.Fatal:
                vscode.window.showErrorMessage(details.message);
                break;
        }
        
        // For fatal errors, additional actions could be taken
        if (details.severity === ErrorSeverity.Fatal) {
            // Log to telemetry or other critical error handling
            console.error('FATAL ERROR:', details);
        }
    }
    
    /**
     * Log error to internal storage and console
     */
    private logError(details: ErrorDetails): void {
        // Add to internal log
        this.errorLog.push(details);
        
        // Log to console with different formatting based on severity
        const source = details.source ? `[${details.source}] ` : '';
        
        switch (details.severity) {
            case ErrorSeverity.Info:
                console.log(`${source}${details.message}`);
                break;
            case ErrorSeverity.Warning:
                console.warn(`${source}${details.message}`);
                break;
            case ErrorSeverity.Error:
            case ErrorSeverity.Fatal:
                console.error(`${source}${details.message}`, details.originalError);
                break;
        }
    }
    
    /**
     * Get recent errors for diagnostics
     */
    public getRecentErrors(count: number = 10): ErrorDetails[] {
        return this.errorLog.slice(-count);
    }
    
    /**
     * Clear error log
     */
    public clearErrorLog(): void {
        this.errorLog = [];
    }
}

/**
 * Helper function to handle task-related errors
 */
export function handleTaskError(message: string, error?: Error, source?: string): void {
    const handler = ErrorHandler.getInstance();
    
    handler.handleError({
        message: `Task Error: ${message}`,
        severity: ErrorSeverity.Error,
        source: source || 'TaskManager',
        originalError: error
    });
}