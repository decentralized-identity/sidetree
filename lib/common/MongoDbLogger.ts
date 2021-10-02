import { LoggerState, MongoClient } from 'mongodb';
import Logger from '../common/Logger';

/**
 * Base class that contains the common logging functions for mongodb.
 */
export default class MongoDbLogger {
  /**
   * Set the logger for mongodb command monitoring.
   * @param client the mongodb client
   */
  public static setCommandLogger (client: MongoClient) {
    client.on('commandSucceeded', (event: any) => {
      Logger.info(event);
    });
    client.on('commandFailed', (event: any) => {
      Logger.warn(event);
    });
  }

  /**
   * The custom logger for general logging purpose in mongodb client
   * @param _message The message to log
   * @param state The complete logging event state
   */
  public static customLogger (_message: string | undefined, state: LoggerState | undefined): void {
    if (state === undefined) {
      return;
    }

    switch (state.type) {
      case 'warn':
        Logger.warn(state);
        break;
      case 'error':
        Logger.error(state);
        break;
      case 'debug':
        Logger.debug(state);
        break;
      default:
        Logger.info(state);
    }
  };
}
