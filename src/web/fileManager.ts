import * as vscode from 'vscode';

export async function ensureTemplatesExist(context: vscode.ExtensionContext): Promise<vscode.Uri> {
    try {
        // Get configuration
        const config = vscode.workspace.getConfiguration('calmdown');
        const baseDirectory = config.get<string>('folderPath') || 'Journal';
        
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            throw new Error('No workspace folder is open');
        }
        
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
        
        // Define templates directory
        const templatesDir = vscode.Uri.joinPath(workspaceFolder, baseDirectory, 'templates');
        
        try {
            // Check if templates directory exists
            await vscode.workspace.fs.stat(templatesDir);
        } catch {
            // Create templates directory if it doesn't exist
            await vscode.workspace.fs.createDirectory(templatesDir);
            
            // Copy default templates
            const defaultTemplatesDir = vscode.Uri.joinPath(context.extensionUri, '.templates');
            const files = await vscode.workspace.fs.readDirectory(defaultTemplatesDir);
            
            // Copy each template file
            for (const [name, type] of files) {
                if (type === vscode.FileType.File) {
                    const sourceUri = vscode.Uri.joinPath(defaultTemplatesDir, name);
                    const destUri = vscode.Uri.joinPath(templatesDir, name);
                    
                    const content = await vscode.workspace.fs.readFile(sourceUri);
                    await vscode.workspace.fs.writeFile(destUri, content);
                }
            }
            
            vscode.window.showInformationMessage(
                `Template files created in ${baseDirectory}/templates. You can customize these templates for future notes.`
            );
        }
        
        return templatesDir;
    } catch (err) {
        console.error('Failed to set up templates:', err);
        throw err;
    }
}

export async function getTemplateContent(context: vscode.ExtensionContext, templateName = 'daily'): Promise<string> {
    try {
        // Get configuration
        const config = vscode.workspace.getConfiguration('calmdown');
        const baseDirectory = config.get<string>('folderPath') || 'Journal';
        
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            throw new Error('No workspace folder is open');
        }
        
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
        
        // Try user template first
        const userTemplateUri = vscode.Uri.joinPath(
            workspaceFolder, 
            baseDirectory, 
            'templates', 
            `${templateName}.md`
        );
        
        try {
            const content = await vscode.workspace.fs.readFile(userTemplateUri);
            return new TextDecoder().decode(content);
        } catch {
            // Fall back to default template
            const templateUri = vscode.Uri.joinPath(context.extensionUri, '.templates', `${templateName}.md`);
            try {
                const templateData = await vscode.workspace.fs.readFile(templateUri);
                return new TextDecoder().decode(templateData);
            } catch (err) {
                console.error(`Template ${templateName} not found:`, err);
                return `# Notes for {{DATE}}\n\n`; // Default content if template not found
            }
        }
    } catch (err) {
        console.error(`Error loading template ${templateName}:`, err);
        return `# Notes for {{DATE}}\n\n`; // Default content if template not found
    }
}

export async function createNote(dateString: string, context: vscode.ExtensionContext): Promise<void> {
    try {
        // Validate date string (format: YYYY-MM-DD)
        if (!isValidDateString(dateString)) {
            vscode.window.showErrorMessage(`Invalid date format: ${dateString}. Expected format is YYYY-MM-DD.`);
            return;
        }

        // Ensure templates exist
        await ensureTemplatesExist(context);

        // Get configuration
        const config = vscode.workspace.getConfiguration('calmdown');
        const baseDirectory = config.get<string>('folderPath') || 'Journal';
        const fileNameFormat = config.get<string>('fileNameFormat') || 'YYYY-MM-DD';
        
        // Parse the date from the dateString (format: YYYY-MM-DD)
        const date = new Date(dateString);
        const year = date.getFullYear().toString();
        
        // Format month as MM-MonthName (e.g., 01-January)
        const monthNumber = (date.getMonth() + 1).toString().padStart(2, '0');
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        const monthFolder = `${monthNumber}-${monthName}`;
        
        // Calculate week number (always 2 digits)
        const weekNumber = getISOWeek(date).toString().padStart(2, '0');
        
        // Format file name based on configuration
        let fileName = dateString + '.md';
        if (fileNameFormat !== 'YYYY-MM-DD') {
            // Apply custom format if configured
            fileName = formatDateString(date, fileNameFormat) + '.md';
        }
        
        // Determine file path
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder is open. Please open a folder to save notes.');
            return;
        }
        
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
        
        // Build path segments
        const pathSegments = [baseDirectory, year, monthFolder, `Week-${weekNumber}`];
        
        // Create folderUri by joining path segments one by one
        let folderUri = workspaceFolder;
        for (const segment of pathSegments) {
            if (segment && segment.length > 0) {
                folderUri = vscode.Uri.joinPath(folderUri, segment);
                try {
                    await vscode.workspace.fs.createDirectory(folderUri);
                } catch (err) {
                    console.error(`Error creating directory ${segment}:`, err);
                }
            }
        }
        
        // Create the full file path
        const filePath = vscode.Uri.joinPath(folderUri, fileName);
        
        // Check if file exists
        try {
            await vscode.workspace.fs.stat(filePath);
            // File exists, open it
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        } catch {
            // File doesn't exist, create it
            // Get template content
            const templateContent = await getTemplateContent(context, 'daily');
            
            // Replace placeholders
            const initialContent = templateContent
                .replace(/\{\{DATE\}\}/g, dateString)
                .replace(/\{\{YEAR\}\}/g, dateString.substring(0, 4))
                .replace(/\{\{MONTH\}\}/g, dateString.substring(5, 7))
                .replace(/\{\{DAY\}\}/g, dateString.substring(8, 10));
            
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(filePath, encoder.encode(initialContent));
            
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Error creating note: ${err}`);
    }
}

// Validate date string format (YYYY-MM-DD)
function isValidDateString(dateString: string): boolean {
    // Check format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return false;
    }
    
    // Check if it's a valid date
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return false;
    }
    
    // Check if the formatted date matches the input
    // This ensures dates like "2025-02-31" are rejected
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return dateString === `${year}-${month}-${day}`;
}

// Format date according to specified format
function formatDateString(date: Date, format: string): string {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    let result = format;
    result = result.replace('YYYY', year);
    result = result.replace('MM', month);
    result = result.replace('DD', day);
    
    return result;
}

// Function to calculate ISO week number - ensuring consistent implementation with calendar.js
function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export async function checkNotesExist(dates: string[]): Promise<string[]> {
    try {
        // Get configuration
        const config = vscode.workspace.getConfiguration('calmdown');
        const baseDirectory = config.get<string>('folderPath') || 'Journal';
        
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return [];
        }
        
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
        const existingNotes: string[] = [];
        
        // Check each date
        for (const dateString of dates) {
            // Parse the date
            const date = new Date(dateString);
            const year = date.getFullYear().toString();
            
            // Format month folder
            const monthNumber = (date.getMonth() + 1).toString().padStart(2, '0');
            const monthName = date.toLocaleString('en-US', { month: 'long' });
            const monthFolder = `${monthNumber}-${monthName}`; 
            
            // Get week number
            const weekNumber = getISOWeek(date).toString().padStart(2, '0');
            
            // Build path to check
            const relativePath = [baseDirectory, year, monthFolder, `Week-${weekNumber}`, `${dateString}.md`]
                .filter(segment => segment.length > 0)
                .join('/');
            
            const filePath = vscode.Uri.joinPath(workspaceFolder, relativePath);
            
            // Check if file exists
            try {
                await vscode.workspace.fs.stat(filePath);
                // If no error, file exists
                existingNotes.push(dateString);
            } catch (err) {
                // File doesn't exist, do nothing
            }
        }
        
        return existingNotes;
    } catch (err) {
        console.error('Error checking notes:', err);
        return [];
    }
}