/**
 * ReadableStream utilities
 */
export default class ReadableStream {

  /**
   * Given a readable stream, reads all data until end or error
   * @param stream Fetch readable stream to read
   * @returns a string of the readable stream data
   */
  public static async readAll (stream: NodeJS.ReadableStream): Promise<string> {
    // Set callback for the 'readable' event to concatenate chunks of the readable stream.
    let content: string = '';

    stream.on('readable', () => {
      // NOTE: Cast to any is to work-around incorrect TS definition for read() where
      // `null` should be a possible return type but is not defined in @types/node: 10.12.18.
      let chunk = stream.read() as any;
      while (chunk !== null) {
        content += chunk;
        chunk = stream.read();
      }
    });

    // Create a promise to wrap the successful/failed read events.
    const readBody = new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    // Wait until the read is completed.
    await readBody;

    return content;
  }
}
