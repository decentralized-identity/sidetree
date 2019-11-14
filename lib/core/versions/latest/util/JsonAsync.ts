const yieldableJson = require('yieldable-json');

/**
 * A JSON library that performs operations asynchronously.
 */
export default class JsonAsync {
  /**
   * Parses the given operation into a JavaScript object asynchronously,
   * to allow the event loop a chance to handle requests.
   */
  public static async parse (jsonBuffer: Buffer): Promise<any> {

    const jsonString = jsonBuffer.toString();

    // Create a promise to wrap the successful/failed read events.
    const jsonParsePromise = new Promise((resolve, reject) => {
      yieldableJson.parseAsync(jsonString, (err: any, data: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    // Wait until the JSON parsing is completed.
    const result = await jsonParsePromise;
    return result;
  }
}
