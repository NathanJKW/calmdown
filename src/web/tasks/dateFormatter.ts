/**
 * Format date as YYMMDD for task due dates
 */
export function formatDateForTask(date: Date): string {
    const yy = date.getFullYear().toString().substring(2, 4);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    return `${yy}${mm}${dd}`;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateYYYYMMDD(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format date as Month Day, Year (e.g., January 1, 2023)
 */
export function formatDateLong(date: Date): string {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Parse a date string in YYMMDD format
 */
export function parseTaskDate(dateStr: string): Date {
    if (dateStr.length !== 6) {
        throw new Error(`Invalid task due date format: ${dateStr}`);
    }
    
    const yy = parseInt(dateStr.substring(0, 2));
    const mm = parseInt(dateStr.substring(2, 4)) - 1; // 0-based month
    const dd = parseInt(dateStr.substring(4, 6));
    
    // Handle 2-digit year (assume 20xx for now)
    const year = 2000 + yy;
    
    return new Date(year, mm, dd);
}

/**
 * Calculate ISO week number
 */
export function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Format a task date for display in UI
 */
export function formatTaskDateForDisplay(dateStr: string): string {
    if (dateStr.length !== 6) {
        return dateStr; // Return as-is if invalid
    }
    
    try {
        // Format as MM-DD-YY for display
        return `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(0, 2)}`;
    } catch {
        return dateStr;
    }
}

/**
 * Get relative date description for due dates (e.g., Today, Tomorrow, 3 days from now)
 */
export function getRelativeDateDescription(dateStr: string): string {
    try {
        const dueDate = parseTaskDate(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const taskDay = new Date(dueDate);
        taskDay.setHours(0, 0, 0, 0);
        
        const diffDays = Math.floor((taskDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            return diffDays === -1 ? 'Due Yesterday' : `${Math.abs(diffDays)} days overdue`;
        } else if (diffDays === 0) {
            return 'Due Today';
        } else if (diffDays === 1) {
            return 'Due Tomorrow';
        } else if (diffDays < 7) {
            return `Due in ${diffDays} days`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `Due in ${weeks} week${weeks > 1 ? 's' : ''}`;
        } else {
            return `Due on ${formatDateLong(dueDate)}`;
        }
    } catch {
        return formatTaskDateForDisplay(dateStr);
    }
}