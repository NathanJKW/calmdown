import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Register our custom sidebar webview provider
    const calendarProvider = new CalendarViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'calmdown.calendarView',
            calendarProvider
        )
    );

    // Register the command to open the calendar
    context.subscriptions.push(
        vscode.commands.registerCommand('calmdown.openCalendar', () => {
            vscode.commands.executeCommand('workbench.view.extension.calmdown-sidebar');
        })
    );
}

class CalendarViewProvider implements vscode.WebviewViewProvider {
    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getWebviewContent(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'dateClicked':
                        await this.createNote(message.date);
                        break;
                }
            },
            undefined,
            []
        );
    }

    private _getWebviewContent(webview: vscode.Webview): string {
        // Create and return the HTML content for the calendar
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Calmdown Calendar</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        padding: 0;
                        margin: 0;
                    }

                    .container {
                        padding: 10px;
                    }

                    .calendar-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                    }

                    .month-year {
                        font-weight: bold;
                    }

                    .calendar {
                        display: grid;
                        grid-template-columns: auto repeat(7, 1fr);
                        gap: 2px;
                    }

                    .weekday {
                        text-align: center;
                        font-weight: bold;
                        padding: 5px;
                        font-size: 0.8em;
                    }

                    .week-number {
                        text-align: center;
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.8em;
                        padding: 5px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .day {
                        padding: 5px;
                        text-align: center;
                        cursor: pointer;
                        border-radius: 3px;
                        aspect-ratio: 1 / 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .day:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }

                    .current-month {
                        font-weight: normal;
                    }

                    .other-month {
                        color: var(--vscode-disabledForeground);
                    }

                    .today {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 4px 8px;
                        cursor: pointer;
                        border-radius: 3px;
                    }

                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="calendar-header">
                        <button id="prev-month">&lt;</button>
                        <div class="month-year" id="month-year">April 2025</div>
                        <button id="next-month">&gt;</button>
                    </div>
                    <div class="calendar" id="calendar">
                        <!-- Calendar will be generated by JS -->
                    </div>
                </div>

                <script>
                    (function() {
                        // Current date state
                        let currentDate = new Date();
                        let currentMonth = currentDate.getMonth();
                        let currentYear = currentDate.getFullYear();
                        
                        // Update the calendar on load
                        updateCalendar();
                        
                        // Set up event listeners
                        document.getElementById('prev-month').addEventListener('click', () => {
                            currentMonth--;
                            if (currentMonth < 0) {
                                currentMonth = 11;
                                currentYear--;
                            }
                            updateCalendar();
                        });
                        
                        document.getElementById('next-month').addEventListener('click', () => {
                            currentMonth++;
                            if (currentMonth > 11) {
                                currentMonth = 0;
                                currentYear++;
                            }
                            updateCalendar();
                        });
                        
                        function updateCalendar() {
                            const today = new Date();
                            const monthYear = document.getElementById('month-year');
                            const calendar = document.getElementById('calendar');
                            
                            // Update month/year display
                            monthYear.textContent = new Date(currentYear, currentMonth).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                            
                            // Clear calendar
                            calendar.innerHTML = '';
                            
                            // Add corner cell
                            const cornerCell = document.createElement('div');
                            cornerCell.classList.add('week-number');
                            cornerCell.textContent = 'W';
                            calendar.appendChild(cornerCell);
                            
                            // Add day headers
                            const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
                            weekdays.forEach(day => {
                                const dayHeader = document.createElement('div');
                                dayHeader.classList.add('weekday');
                                dayHeader.textContent = day;
                                calendar.appendChild(dayHeader);
                            });
                            
                            // Get first day of month
                            const firstDay = new Date(currentYear, currentMonth, 1);
                            // Get last day of month
                            const lastDay = new Date(currentYear, currentMonth + 1, 0);
                            
                            // Adjust first day to be Monday-based (0 = Monday, 6 = Sunday)
                            let firstDayIndex = firstDay.getDay() - 1;
                            if (firstDayIndex < 0) firstDayIndex = 6;  // Sunday becomes 6
                            
                            // Calculate days from previous month
                            const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
                            const startingDate = prevMonthLastDay - firstDayIndex + 1;
                            
                            // Calculate total cells needed (max 6 weeks)
                            const totalCells = 42;  // 6 weeks * 7 days
                            
                            // Initialize date counter for the calendar
                            let date = new Date(currentYear, currentMonth - 1, startingDate);
                            
                            // Generate calendar cells
                            for (let i = 0; i < totalCells / 7; i++) {
                                // Add week number
                                const weekNum = getISOWeek(new Date(date));
                                const weekCell = document.createElement('div');
                                weekCell.classList.add('week-number');
                                weekCell.textContent = weekNum;
                                calendar.appendChild(weekCell);
                                
                                // Add days for this week
                                for (let j = 0; j < 7; j++) {
                                    const dayCell = document.createElement('div');
                                    dayCell.classList.add('day');
                                    
                                    const thisDate = new Date(date);
                                    const dateString = formatDate(thisDate);
                                    
                                    // Check if date is in current month
                                    if (thisDate.getMonth() === currentMonth) {
                                        dayCell.classList.add('current-month');
                                    } else {
                                        dayCell.classList.add('other-month');
                                    }
                                    
                                    // Check if date is today
                                    if (thisDate.toDateString() === today.toDateString()) {
                                        dayCell.classList.add('today');
                                    }
                                    
                                    dayCell.textContent = thisDate.getDate();
                                    dayCell.dataset.date = dateString;
                                    
                                    // Add click event
                                    dayCell.addEventListener('click', () => {
                                        const vscode = acquireVsCodeApi();
                                        vscode.postMessage({
                                            command: 'dateClicked',
                                            date: dateString
                                        });
                                    });
                                    
                                    calendar.appendChild(dayCell);
                                    date.setDate(date.getDate() + 1);
                                }
                                
                                // Stop rendering if we've gone past the end of the next month
                                if (date.getMonth() > ((currentMonth + 1) % 12) && i >= 4) {
                                    break;
                                }
                            }
                        }
                        
                        // Format date as YYYY-MM-DD
                        function formatDate(date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            return \`\${year}-\${month}-\${day}\`;
                        }
                        
                        // Get ISO week number
                        function getISOWeek(date) {
                            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
                            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                            return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
                        }
                    })();
                </script>
            </body>
            </html>`;
    }

    private async createNote(dateString: string): Promise<void> {
        try {
            // Get configuration
            const config = vscode.workspace.getConfiguration('calmdown');
            const folderPath = config.get<string>('folderPath') || '';
            const fileNameFormat = config.get<string>('fileNameFormat') || 'YYYY-MM-DD';
            
            // Format file name based on configuration
            const fileName = dateString + '.md';
            
            // Determine file path
            let filePath: vscode.Uri;
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder is open. Please open a folder to save notes.');
                return;
            }
            
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
            
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
}

export function deactivate() {}
