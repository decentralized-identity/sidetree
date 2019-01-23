/**
 * Schema for every log entry.
 */
interface Log {
  correlationId: string;
  requestId: string;
  highResolutionTime: string;
  level: string;
  message: string;
  callStack?: string;
  additionalInfo?: string;
}

/**
 * Possible log levels.
 */
enum LogLevel {
    Info = 'Info',
    Error = 'Error'
}

/**
 * Class for logging.
 */
class Logger {
  /** Property to suppress all logging activity. */
  private suppressd = false;

  /**
   * Writes an informational log entry.
   */
  public info (message: string, additionalInfo?: any) {
    this.log(LogLevel.Info, message, undefined, additionalInfo);
  }

  /**
   * Writes an error log entry.
   * If an Error is given, call stack is also logged.
   *
   * @param additionalInfo Additional info to be logged.
   */
  public error (error: string | Error, additionalInfo?: Object) {
    let message;
    let callStack;

    if (error instanceof Error) {
      message = error.message;
      callStack = error.stack;
    } else {
      message = error;
    }

    this.log(LogLevel.Error, message, callStack, additionalInfo);
  }

  /**
   * Logs an message to stderr if given log level is Error, logs to stdout otherwise.
   */
  private log (logLevel: LogLevel, message: string, callStack?: string, additionalInfo?: any) {
    // Do not log if suppress is on.
    if (this.suppressd) {
      return;
    }

    // Returns current high-resolution real time in a [seconds, nanoseconds] tuple Array,
    // where nanoseconds is the remaining part of the real time that can't be represented in second precision.
    // These times are relative to an arbitrary time in the past, and not related to the time of day.
    // So we can use it to ensure high precision log ordering.
    const highResolutionTime = process.hrtime();

    const log: Log = {
      correlationId: 'TODO', // TODO: may need to use request continuation concepts/libs
      requestId: 'TODO', // TODO: may need to use request continuation concepts/libs
      highResolutionTime: `${highResolutionTime[0] * 1e9 + highResolutionTime[1]}`,
      level: logLevel,
      message: message,
      callStack: callStack,
      additionalInfo: additionalInfo ? JSON.stringify(additionalInfo) : undefined
    };

    if (logLevel === LogLevel.Error) {
      console.error(JSON.stringify(log));
    } else {
      console.log(JSON.stringify(log));
    }
  }

  /**
   * Suppress all logs from being logs when true is passed; Use false to unsuppress.
   */
  public suppressLogging (suppress: boolean) {
    this.suppressd = suppress;
  }
}

const logger: Logger = new Logger();
export default logger;
