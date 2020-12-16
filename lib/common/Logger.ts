import ConsoleLogger from './ConsoleLogger';
import ILogger from './interfaces/ILogger';

/**
 * Logger used in Sidetree with default console implementation.
 */
const logger: ILogger = new ConsoleLogger();
export default logger;
