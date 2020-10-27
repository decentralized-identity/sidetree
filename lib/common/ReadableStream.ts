import ErrorCode from '../common/SharedErrorCode';
import SidetreeError from './SidetreeError';

/* global NodeJS */

/**
 * ReadableStream utilities
 */
export default class ReadableStream {

  /**
   * Given a readable stream, reads all data only if the content does not exceed given max size.
   * Throws error if content exceeds give max size.
   * @param stream Readable stream to read.
   * @param maxAllowedSizeInBytes The maximum allowed size limit of the content.
   * @returns a Buffer of the readable stream data
   */
  public static async readAll (stream: NodeJS.ReadableStream, maxAllowedSizeInBytes?: number): Promise<Buffer> {
    // Set callback for the 'readable' event to concatenate chunks of the readable stream.
    let content: Buffer = Buffer.alloc(0);
    let currentSizeInBytes = 0;

    stream.on('readable', () => {
      // NOTE: Cast to any is to work-around incorrect TS definition for read() where
      // `null` should be a possible return type but is not defined in @types/node: 10.12.18.
      let chunk = stream.read() as any;
      while (chunk !== null) {
        currentSizeInBytes += chunk.length;

        // Monitor on read size only if `maxAllowedSizeInBytes` is set.
        if (maxAllowedSizeInBytes !== undefined &&
            currentSizeInBytes > maxAllowedSizeInBytes) {

          const error = new SidetreeError(
            ErrorCode.ReadableStreamMaxAllowedDataSizeExceeded,
            `Max data size allowed: ${maxAllowedSizeInBytes} bytes, aborted reading at ${currentSizeInBytes} bytes.`
          );

          // NOTE: Cast to any is to work-around incorrect TS definition where `destroy()` is missing.
          (stream as any).destroy(error);
        }

        content = Buffer.concat([content, chunk]);
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
