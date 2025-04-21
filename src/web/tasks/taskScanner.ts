import * as vscode from 'vscode';
import { Task, parseTask } from './taskModel';
import { ConfigService } from '../common/configService';
import { handleTaskError } from '../common/errorHandler';

// Enhanced cache for storing scanned tasks
interface TaskCache {
    tasks: Task[];
    lastScanTime: number;
    fileVersions: Map<string, number>;  // Track document versions
    fileTimestamps: Map<string, number>; // Track file timestamps
}

export class TaskScanner {
    private cache: TaskCache | null = null;
    private scanInProgress = false;
    private journalFolderPath: string | null = null;
    private configService: ConfigService;
    
    constructor() {
        this.configService = ConfigService.getInstance();
        
        // Listen for file changes
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (this.isMarkdownInJournalFolder(doc.uri.fsPath)) {
                this.invalidateFileInCache(doc.uri.fsPath);
            }
        });
        
        // Listen for config changes that might affect journal path
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('calmdown.folderPath')) {
                // Reset cache when journal folder changes
                this.cache = null;
                this.journalFolderPath = null;
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
            // Remove file timestamp
            this.cache.fileTimestamps.delete(filePath);
        }
    }
    
    /**
     * Get journal folder path from configuration
     */
    private async getJournalFolderPath(): Promise<string | null> {
        // Use ConfigService to get journal folder URI
        const journalFolderUri = await this.configService.getJournalFolderUri();
        return journalFolderUri?.fsPath || null;
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
        
        // Use the find files API
        try {
            const markdownFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(journalFolderPath, '**/*.md')
            );
            return markdownFiles;
        } catch (error) {
            handleTaskError("Failed to find markdown files", 
                          error instanceof Error ? error : new Error(String(error)));
            return [];
        }
    }
    
    /**
     * Check if file needs to be rescanned based on timestamp
     */
    private async shouldRescanFile(file: vscode.Uri, fileVersion: number): Promise<boolean> {
        if (!this.cache) {
            return true;
        }
        
        // Check if file exists in version cache
        const cachedVersion = this.cache.fileVersions.get(file.fsPath);
        if (cachedVersion !== undefined && cachedVersion === fileVersion) {
            return false;
        }
        
        try {
            // Check file timestamp
            const fileStats = await vscode.workspace.fs.stat(file);
            const lastModified = fileStats.mtime;
            const cachedTimestamp = this.cache.fileTimestamps.get(file.fsPath);
            
            if (cachedTimestamp !== undefined && cachedTimestamp === lastModified) {
                // File hasn't changed on disk, update version but skip scan
                this.cache.fileVersions.set(file.fsPath, fileVersion);
                return false;
            }
            
            // File has changed, needs rescanning
            return true;
        } catch {
            // If error reading file stats, assume it needs rescanning
            return true;
        }
    }
    
    /**
     * Scan a single file for tasks
     */
    private async scanFileForTasks(file: vscode.Uri): Promise<Task[]> {
        try {
            const document = await vscode.workspace.openTextDocument(file);
            const fileVersion = document.version;
            
            // Check if file needs to be rescanned
            if (!await this.shouldRescanFile(file, fileVersion)) {
                return this.cache!.tasks.filter(task => task.filePath === file.fsPath);
            }
            
            const tasks: Task[] = [];
            
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                // When parsing tasks, ensure we're interpreting the date as due date
                const task = parseTask(line, file.fsPath, i);
                
                if (task) {
                    tasks.push(task);
                }
            }
            
            // Update the cache with file information
            if (this.cache) {
                this.cache.fileVersions.set(file.fsPath, fileVersion);
                
                try {
                    const fileStats = await vscode.workspace.fs.stat(file);
                    this.cache.fileTimestamps.set(file.fsPath, fileStats.mtime);
                } catch (error) {
                    console.warn(`Failed to get timestamp for ${file.fsPath}:`, error);
                }
            }
            
            return tasks;
        } catch (err) {
            handleTaskError(`Error scanning file ${file.fsPath}`, 
                         err instanceof Error ? err : new Error(String(err)));
            return [];
        }
    }
    
    /**
     * Get all open tasks
     */
    public async getOpenTasks(): Promise<Task[]> {
        const cacheTimeout = this.configService.getTaskCacheTimeout();
        
        // Check if we have a recent cache
        const currentTime = Date.now();
        if (this.cache && (currentTime - this.cache.lastScanTime < cacheTimeout) && !this.scanInProgress) {
            // Return cached open tasks if cache is still valid
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
                    fileVersions: new Map(),
                    fileTimestamps: new Map()
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
                fileVersions: this.cache.fileVersions,
                fileTimestamps: this.cache.fileTimestamps
            };
            
            return allTasks.filter(task => task.status === 'TODO');
        } catch (err) {
            handleTaskError('Error scanning for tasks', 
                         err instanceof Error ? err : new Error(String(err)));
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
            handleTaskError(`Could not navigate to task: ${err}`,
                         err instanceof Error ? err : new Error(String(err)));
        }
    }
}