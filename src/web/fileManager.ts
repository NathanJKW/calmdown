import * as vscode from 'vscode';

export async function createNote(dateString: string): Promise<void> {
    try {
        // Get configuration
        const config = vscode.workspace.getConfiguration('calmdown');
        const folderPath = config.get<string>('folderPath') || '';
        const fileNameFormat = config.get<string>('fileNameFormat') || 'YYYY-MM-DD';
        
        // Format file name based on configuration
        // For now, just using the dateString directly
        const fileName = dateString + '.md';
        
        // Determine file path
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder is open. Please open a folder to save notes.');
            return;
        }
        
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
        let filePath: vscode.Uri;
        
        // Create folder path if specified
        if (folderPath) {
            const folderUri = vscode.Uri.joinPath(workspaceFolder, folderPath);
            try {
                await vscode.workspace.fs.createDirectory(folderUri);
            } catch (err) {
                console.error('Error creating directory:', err);
            }
            filePath = vscode.Uri.joinPath(folderUri, fileName);
        } else {
            filePath = vscode.Uri.joinPath(workspaceFolder, fileName);
        }
        
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