import IEventEmitter from './interfaces/IEventEmitter';
import LogColor from './LogColor';
import Logger from './Logger';

/**
 * Event emitter used in Sidetree.
 * Intended to be machine readable for triggering custom handlers.
 */
export default class EventEmitter {
  private static customEvenEmitter: IEventEmitter;

  /**
   * Initializes with custom event emitter if given.
   */
  static initialize (customEventEmitter?: IEventEmitter) {
    if (customEventEmitter !== undefined) {
      EventEmitter.customEvenEmitter = customEventEmitter;
      Logger.info('Custom event emitter given.');
    }
  }

  /**
   * Emits an event.
   */
  public static async emit (eventCode: string, eventData?: {[property: string]: any}): Promise<void> {
    if (EventEmitter.customEvenEmitter !== undefined) {
      await EventEmitter.customEvenEmitter.emit(eventCode, eventData);
    }

    // Always log the event using the logger.
    if (eventData === undefined) {
      Logger.info(LogColor.lightBlue(`Event emitted: ${LogColor.green(eventCode)}`));
    } else {
      Logger.info(LogColor.lightBlue(`Event emitted: ${LogColor.green(eventCode)}: ${JSON.stringify(eventData)}`));
    }
  }
}
