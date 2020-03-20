/**
 * ReadableStream utilities
 */
export default class ReadableStream {

  /**
   * Given a readable stream, reads all data until end or error
   * @param stream Fetch readable stream to read
   * @param contentLength Optional length of the payload, if known
   * @returns a Buffer of the readable stream data
   */
  public static async readAll (stream: NodeJS.ReadableStream, contentLength?: number): Promise<Buffer> {
    let isLengthKnown = true;
    if (contentLength === undefined) {
      contentLength = 0;
      isLengthKnown = false;
    } else if (contentLength < 0) {
      throw new Error('contentLength must not be negative');
    }

    // Set callback for the 'readable' event to concatenate chunks of the readable stream.
    let content: Buffer = Buffer.alloc(contentLength);

    let offset = 0;
    stream.on('readable', () => {
      // NOTE: Cast to any is to work-around incorrect TS definition for read() where
      // `null` should be a possible return type but is not defined in @types/node: 10.12.18.
      let chunk = stream.read() as any;
      while (chunk !== null) {
        if (isLengthKnown) {
          if (content.length < offset + chunk.length) {
            break; // Given contentLength too small to hold all data from stream. Error handled at end of function.
          }
          content.fill(chunk, offset, offset + chunk.length);
          offset += chunk.length;
        } else {
          content = Buffer.concat([content, chunk]);
        }
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

    if (isLengthKnown && offset !== contentLength) {
      throw new Error('contentLength must equal length of data on stream');
    }
    return content;
  }

}
