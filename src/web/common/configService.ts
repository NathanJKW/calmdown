import * as vscode from 'vscode';

/**
 * Service to centralize access to extension configuration
 */
export class ConfigService {
    private static instance: ConfigService;
    
    private constructor() {}
    
    public static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }
    
    /**
     * Get the base journal folder name from configuration
     */
    public getJournalFolder(): string {
        const config = vscode.workspace.getConfiguration('calmdown');
        return config.get<string>('folderPath') || 'Journal';
    }
    
    /**
     * Get the journal folder URI
     */
    public async getJournalFolderUri(): Promise<vscode.Uri | null> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return null;
        }
        
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
        const journalFolderUri = vscode.Uri.joinPath(workspaceFolder, this.getJournalFolder());
        
        try {
            // Check if the folder exists
            await vscode.workspace.fs.stat(journalFolderUri);
            return journalFolderUri;
        } catch {
            // Try to create the folder
            try {
                await vscode.workspace.fs.createDirectory(journalFolderUri);
                return journalFolderUri;
            } catch {
                return null;
            }
        }
    }
    
    /**
     * Get full file path for a note by date
     */
    public async getNotePathByDate(date: Date): Promise<vscode.Uri | null> {
        const journalFolder = await this.getJournalFolderUri();
        if (!journalFolder) {
            return null;
        }
        
        const year = date.getFullYear().toString();
        const monthNumber = (date.getMonth() + 1).toString().padStart(2, '0');
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        const monthFolder = `${monthNumber}-${monthName}`;
        
        // Calculate week number (ISO week)
        const weekNumber = this.getISOWeek(date).toString().padStart(2, '0');
        
        // Format date as YYYY-MM-DD for filename
        const dateStr = this.formatDateYYYYMMDD(date);
        
        return vscode.Uri.joinPath(
            journalFolder,
            year,
            monthFolder,
            `Week-${weekNumber}`,
            `${dateStr}.md`
        );
    }
    
    /**
     * Get task cache timeout in milliseconds
     */
    public getTaskCacheTimeout(): number {
        const config = vscode.workspace.getConfiguration('calmdown');
        // Default to 30 seconds if not specified
        return config.get<number>('taskCacheTimeout') || 30000;
    }
    
    /**
     * Format date as YYYY-MM-DD
     */
    private formatDateYYYYMMDD(date: Date): string {
        const yyyy = date.getFullYear();
        const mm = (date.getMonth() + 1).toString().padStart(2, '0');
        const dd = date.getDate().toString().padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    
    /**
     * Calculate ISO week number
     */
    private getISOWeek(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    }
}