/**
 * Custom event emitter interface.
 */
export default interface IEventEmitter {
  /**
   * Emits an event.
   */
  emit (eventCode: string, eventData?: {[property: string]: any}): Promise<void>;
}
