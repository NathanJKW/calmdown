import * as vscode from 'vscode';
import { Task, parseTask } from './taskModel';

// Cache for storing scanned tasks to improve performance
interface TaskCache {
    tasks: Task[];
    lastScanTime: number;
    fileVersions: Map<string, number>;  // Track document versions
}

export class TaskScanner {
    private cache: TaskCache | null = null;
    private scanInProgress = false;
    private journalFolderPath: string | null = null;
    
    constructor() {
        // Listen for file changes
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (this.isMarkdownInJournalFolder(doc.uri.fsPath)) {
                this.invalidateFileInCache(doc.uri.fsPath);
            }
        });
    }
    
    private isMarkdownInJournalFolder(fsPath: string): boolean {
        if (!this.journalFolderPath) {
            return false;
        }
        return fsPath.startsWith(this.journalFolderPath) && fsPath.endsWith('.md');
    }
    
    private invalidateFileInCache(filePath: string): void {
        if (this.cache) {
            // Remove tasks from this file from cache
            this.cache.tasks = this.cache.tasks.filter(task => task.filePath !== filePath);
            // Remove the file version from tracking
            this.cache.fileVersions.delete(filePath);
        }
    }
    
    /**
     * Get journal folder path from configuration
     */
    private async getJournalFolderPath(): Promise<string | null> {
        const config = vscode.workspace.getConfiguration('calmdown');
        const baseDirectory = config.get<string>('folderPath') || 'Journal';
        
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return null;
        }
        
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
        const journalFolderUri = vscode.Uri.joinPath(workspaceFolder, baseDirectory);
        
        try {
            // Check if the folder exists
            await vscode.workspace.fs.stat(journalFolderUri);
            return journalFolderUri.fsPath;
        } catch {
            return null;
        }
    }
    
    /**
     * Find all markdown files in the Journal folder and its subfolders
     */
    private async findMarkdownFiles(): Promise<vscode.Uri[]> {
        const journalFolderPath = await this.getJournalFolderPath();
        if (!journalFolderPath) {
            return [];
        }
        
        this.journalFolderPath = journalFolderPath;
        
        // Use the find files API - much faster than manual recursion
        const markdownFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(journalFolderPath, '**/*.md')
        );
        
        return markdownFiles;
    }
    
    /**
     * Scan a single file for tasks
     */
    private async scanFileForTasks(file: vscode.Uri): Promise<Task[]> {
        try {
            const document = await vscode.workspace.openTextDocument(file);
            const fileVersion = document.version;
            
            // Skip this file if it's already in the cache with the same version
            if (this.cache?.fileVersions.get(file.fsPath) === fileVersion) {
                return this.cache.tasks.filter(task => task.filePath === file.fsPath);
            }
            
            const tasks: Task[] = [];
            
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                const task = parseTask(line, file.fsPath, i);
                
                if (task) {
                    tasks.push(task);
                }
            }
            
            // Update the file version in the cache
            if (this.cache) {
                this.cache.fileVersions.set(file.fsPath, fileVersion);
            }
            
            return tasks;
        } catch (err) {
            console.error(`Error scanning file ${file.fsPath}:`, err);
            return [];
        }
    }
    
    /**
     * Get all open tasks
     */
    public async getOpenTasks(): Promise<Task[]> {
        // Check if we have a recent cache
        const currentTime = Date.now();
        if (this.cache && (currentTime - this.cache.lastScanTime < 30000) && !this.scanInProgress) {
            // Return cached open tasks if less than 30 seconds old
            return this.cache.tasks.filter(task => task.status === 'TODO');
        }
        
        // If a scan is already in progress, wait for it
        if (this.scanInProgress) {
            // Wait for current scan to finish with max 5 second timeout
            let waitTime = 0;
            while (this.scanInProgress && waitTime < 5000) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitTime += 100;
            }
            
            if (this.cache) {
                return this.cache.tasks.filter(task => task.status === 'TODO');
            }
        }
        
        try {
            this.scanInProgress = true;
            
            // Initialize or reset cache
            if (!this.cache) {
                this.cache = {
                    tasks: [],
                    lastScanTime: currentTime,
                    fileVersions: new Map()
                };
            }
            
            const markdownFiles = await this.findMarkdownFiles();
            const allTasks: Task[] = [];
            
            // Process files in batches to avoid UI freezes
            const batchSize = 20;
            for (let i = 0; i < markdownFiles.length; i += batchSize) {
                const batch = markdownFiles.slice(i, i + batchSize);
                const batchTasks = await Promise.all(batch.map(file => this.scanFileForTasks(file)));
                
                for (const tasks of batchTasks) {
                    allTasks.push(...tasks);
                }
                
                // Small pause between batches to keep UI responsive
                if (i + batchSize < markdownFiles.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            // Update cache
            this.cache = {
                tasks: allTasks,
                lastScanTime: Date.now(),
                fileVersions: this.cache.fileVersions
            };
            
            return allTasks.filter(task => task.status === 'TODO');
        } catch (err) {
            console.error('Error scanning for tasks:', err);
            return [];
        } finally {
            this.scanInProgress = false;
        }
    }
    
    /**
     * Navigate to a specific task
     */
    public async navigateToTask(task: Task): Promise<void> {
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
            vscode.window.showErrorMessage(`Could not navigate to task: ${err}`);
        }
    }
}