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
    
    // Improving the calendar rendering logic
    function updateCalendar() {
        try {
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
                const dayCell = document.createElement('div');
                dayCell.classList.add('weekday');
                dayCell.textContent = day;
                calendar.appendChild(dayCell);
            });
            
            // Get first day of month
            const firstDay = new Date(currentYear, currentMonth, 1);
            
            // Adjust first day to be Monday-based (0 = Monday, 6 = Sunday)
            let firstDayIndex = firstDay.getDay() - 1;
            if (firstDayIndex < 0) firstDayIndex = 6; // Sunday becomes 6
            
            // Calculate days from previous month
            const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
            const startingDate = prevMonthLastDay - firstDayIndex + 1;
            
            // Initialize month tracking
            let currentMonthDisplayed = currentMonth;
            let currentYearDisplayed = currentYear;
            let prevMonth = currentMonth - 1;
            let prevYear = currentYear;
            
            if (prevMonth < 0) {
                prevMonth = 11;
                prevYear--;
            }
            
            // Start with the appropriate date from the previous month
            let date = new Date(prevYear, prevMonth, startingDate);
            
            // Track the current week for week numbers
            let currentWeek = null;
            
            // Generate 6 weeks (42 days) to ensure consistent calendar size
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 7; j++) {
                    if (j === 0) {
                        // Add week number at the beginning of each row
                        const weekNum = getISOWeek(date);
                        if (currentWeek !== weekNum) {
                            currentWeek = weekNum;
                            const weekCell = document.createElement('div');
                            weekCell.classList.add('week-number');
                            weekCell.textContent = weekNum;
                            calendar.appendChild(weekCell);
                        }
                    }
                    
                    // Create day cell
                    const dayCell = document.createElement('div');
                    dayCell.classList.add('day');
                    
                    // Determine if the date is in the current month
                    const month = date.getMonth();
                    if (month === currentMonth) {
                        dayCell.classList.add('current-month');
                    } else {
                        dayCell.classList.add('other-month');
                    }
                    
                    // Check if it's today
                    const dateString = formatDate(date);
                    const todayString = formatDate(today);
                    if (dateString === todayString) {
                        dayCell.classList.add('today');
                    }
                    
                    // Set date text and dataset
                    dayCell.textContent = date.getDate();
                    dayCell.dataset.date = dateString;
                    
                    // Add click event
                    dayCell.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'dateClicked',
                            date: dateString
                        });
                    });
                    
                    calendar.appendChild(dayCell);
                    
                    // Move to next day
                    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
                }
            }
            
            // After rendering, check for existing notes
            refreshNoteIndicators();
        } catch (error) {
            console.error('Error updating calendar:', error);
            // Notify extension of the error
            vscode.postMessage({
                command: 'error',
                message: `Calendar rendering error: ${error.message}`
            });
        }
    }
    
    // Format date as YYYY-MM-DD (consistent with TS implementation)
    function formatDate(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // Get ISO week number (consistent with TS implementation)
    function getISOWeek(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    }
    
    // Compare two dates to see if they're the same day (regardless of time)
    function isSameDay(date1, date2) {
        return formatDate(date1) === formatDate(date2);
    }
})();