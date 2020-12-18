import IEventEmitter from './interfaces/IEventEmitter';

/**
 * Event emitter used in Sidetree.
 * Intended to be machine readable for triggering custom handlers.
 */
export default class EventEmitter {
  private static singleton: IEventEmitter = { emit: async () => { } }; // Default to no-op.

  /**
   * Overrides the default logger if given.
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
