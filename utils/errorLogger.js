import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const errorLogPath = join(process.cwd(), 'errorLog.json');
const MAX_ERRORS = 100; // Keep last 100 errors

/**
 * Structure for logging internal errors
 */
export class ErrorLog {
  static log(command, error, context = {}) {
    const timestamp = new Date().toISOString();
    const errorEntry = {
      timestamp,
      command,
      message: error?.message || String(error),
      stack: error?.stack || null,
      code: error?.code || error?.status || null,
      context: {
        productId: context.productId || null,
        variantId: context.variantId || null,
        quantity: context.quantity || null,
        userId: context.userId || null,
        userName: context.userName || null,
        ...context
      }
    };

    try {
      let errorLog = [];

      // Load existing errors
      if (existsSync(errorLogPath)) {
        try {
          const fileContent = readFileSync(errorLogPath, 'utf-8');
          errorLog = JSON.parse(fileContent);
        } catch (parseError) {
          console.error('[ERROR LOGGER] Failed to parse errorLog.json, starting fresh');
          errorLog = [];
        }
      }

      // Add new error
      errorLog.push(errorEntry);

      // Keep only last MAX_ERRORS
      if (errorLog.length > MAX_ERRORS) {
        errorLog = errorLog.slice(-MAX_ERRORS);
      }

      // Save to file
      writeFileSync(errorLogPath, JSON.stringify(errorLog, null, 2));

      // Console log with formatting
      console.error(`[ERROR LOGGED] ${command} - ${errorEntry.message}`, errorEntry.context);

      return errorEntry;
    } catch (loggingError) {
      console.error('[ERROR LOGGER FAILED]', loggingError.message);
    }
  }

  static getRecentErrors(limit = 10) {
    try {
      if (existsSync(errorLogPath)) {
        const fileContent = readFileSync(errorLogPath, 'utf-8');
        const errors = JSON.parse(fileContent);
        return errors.slice(-limit);
      }
    } catch (e) {
      console.error('[ERROR LOGGER] Could not retrieve errors:', e.message);
    }
    return [];
  }

  static getSummary() {
    try {
      if (existsSync(errorLogPath)) {
        const fileContent = readFileSync(errorLogPath, 'utf-8');
        const errors = JSON.parse(fileContent);

        const summary = {
          totalErrors: errors.length,
          byCommand: {},
          byCode: {},
          lastError: errors[errors.length - 1] || null,
          timeline: []
        };

        errors.forEach((err) => {
          // Group by command
          summary.byCommand[err.command] = (summary.byCommand[err.command] || 0) + 1;

          // Group by error code
          const code = err.code || 'unknown';
          summary.byCode[code] = (summary.byCode[code] || 0) + 1;

          // Timeline
          summary.timeline.push({
            time: err.timestamp,
            command: err.command,
            message: err.message
          });
        });

        return summary;
      }
    } catch (e) {
      console.error('[ERROR LOGGER] Could not generate summary:', e.message);
    }
    return null;
  }

  static clearOldErrors(daysOld = 7) {
    try {
      if (existsSync(errorLogPath)) {
        const fileContent = readFileSync(errorLogPath, 'utf-8');
        let errors = JSON.parse(fileContent);

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        errors = errors.filter((err) => new Date(err.timestamp) > cutoffDate);
        writeFileSync(errorLogPath, JSON.stringify(errors, null, 2));

        console.log(`[ERROR LOGGER] Cleaned errors older than ${daysOld} days`);
      }
    } catch (e) {
      console.error('[ERROR LOGGER] Could not clean old errors:', e.message);
    }
  }
}

export default ErrorLog;
