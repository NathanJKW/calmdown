import * as vscode from 'vscode';

export async function createNote(dateString: string): Promise<void> {
    try {
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
        const fileName = dateString + '.md';
        
        // Determine file path
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder is open. Please open a folder to save notes.');
            return;
        }
        
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
        
        // Create hierarchical path: <baseDirectory>/Year/MM-MonthName/Week-XX/
        const relativePath = [baseDirectory, year, monthFolder, `Week-${weekNumber}`]
            .filter(segment => segment.length > 0) // Remove empty segments
            .join('/');
        
        // Create the full directory path
        const folderUri = vscode.Uri.joinPath(workspaceFolder, relativePath);
        try {
            await vscode.workspace.fs.createDirectory(folderUri);
        } catch (err) {
            console.error('Error creating directory:', err);
        }
        
        // Create the full file path
        const filePath = vscode.Uri.joinPath(folderUri, fileName);
        
        // Check if file exists
        try {
            await vscode.workspace.fs.stat(filePath);
            // File exists, open it
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        } catch (err) {
            // File doesn't exist, create it
            const initialContent = `# Notes for ${dateString}\n\n`;
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(filePath, encoder.encode(initialContent));
            
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Error creating note: ${err}`);
    }
}

// Function to calculate ISO week number
function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}