(function() {
    // Acquire VS Code API
    const vscode = acquireVsCodeApi();
    
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
    
    // Listen for messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'existingNotes') {
            updateNoteIndicators(message.dates);
        } else if (message.command === 'refreshIndicators') {
            // When a note is created, refresh the indicators
            refreshNoteIndicators();
        }
    });
    
    function refreshNoteIndicators() {
        const datesToCheck = [];
        document.querySelectorAll('.day').forEach(day => {
            if (day.dataset.date) {
                datesToCheck.push(day.dataset.date);
            }
        });
        
        if (datesToCheck.length > 0) {
            // Request check for existing notes
            vscode.postMessage({
                command: 'checkDates',
                dates: datesToCheck
            });
        }
    }
    
    function updateNoteIndicators(dates) {
        // Clear existing indicators
        document.querySelectorAll('.day.has-note').forEach(el => {
            el.classList.remove('has-note');
        });
        
        // Add indicators for dates with notes
        dates.forEach(date => {
            const dayCell = document.querySelector(`.day[data-date="${date}"]`);
            if (dayCell) {
                dayCell.classList.add('has-note');
            }
        });
    }
    
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
        const totalCells = 42;
        
        // Initialize date counter for the calendar
        // Fix for month transition issues
        let prevMonth = currentMonth - 1;
        let prevYear = currentYear;
        if (prevMonth < 0) {
            prevMonth = 11; // December
            prevYear--;
        }
        let date = new Date(prevYear, prevMonth, startingDate);
        
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
        
        // After rendering the calendar, check which dates have notes
        const datesToCheck = [];
        document.querySelectorAll('.day').forEach(day => {
            datesToCheck.push(day.dataset.date);
        });
        
        // Request check for existing notes
        vscode.postMessage({
            command: 'checkDates',
            dates: datesToCheck
        });
    }
    
    // Format date as YYYY-MM-DD
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // Get ISO week number
    function getISOWeek(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
})();