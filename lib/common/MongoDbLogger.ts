import { LoggerState, MongoClient } from 'mongodb';
import Logger from '../common/Logger';

/**
 * Base class that contains the common logging functions for mongodb.
 */
export default class MongoDbLogger {
  static setCommandLogger (client: MongoClient) {
    client.on('commandSucceeded', (event: any) => {
      Logger.info(event);
    });
    client.on('commandFailed', (event: any) => {
      Logger.warn(event);
    });
  }

  static customLogger = function (_message: string | undefined, state: LoggerState | undefined): void {
    switch (state?.type) {
      case 'debug':
      case 'info':
        Logger.info(state);
        break;
      case 'error':
        Logger.error(state);
    }
  };
}
