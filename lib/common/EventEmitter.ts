import IEventEmitter from './interfaces/IEventEmitter';
import LogColor from './LogColor';

/**
 * Event emitter used in Sidetree.
 * Intended to be machine readable for triggering custom handlers.
 */
export default class EventEmitter {
  // Default to basic console log.
  private static singleton: IEventEmitter = {
    emit: async (eventCode, eventData?) => {
      if (eventData === undefined) {
        console.log(LogColor.lightBlue(`Event emitted: ${LogColor.green(eventCode)}`));
      } else {
        console.log(LogColor.lightBlue(`Event emitted: ${LogColor.green(eventCode)}: ${JSON.stringify(eventData)}`));
      }
    }
  };

  /**
   * Overrides the default event emitter if given.
   */
  static initialize (customEventEmitter?: IEventEmitter) {
    if (customEventEmitter !== undefined) {
      EventEmitter.singleton = customEventEmitter;
    }
  }

  /**
   * Emits an event.
   */
  public static async emit (eventName: string, eventData?: {[property: string]: any}): Promise<void> {
    await EventEmitter.singleton.emit(eventName, eventData);
  }
}
