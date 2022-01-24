import * as util from 'util';
import * as zlib from 'zlib';
import ErrorCode from '../ErrorCode';
import SidetreeError from '../../../../common/SidetreeError';

/**
 * Encapsulates functionality to compress/decompress data.
 */
export default class Compressor {

  /** The estimated ratio/multiplier of decompressed Sidetree CAS file size compared against the compressed file size. */
  public static readonly estimatedDecompressionMultiplier = 3;

  private static readonly gzipAsync = util.promisify(zlib.gzip);

  /**
   * Compresses teh data in gzip and return it as buffer.
   * @param inputAsBuffer The input string to be compressed.
   */
  public static async compress (inputAsBuffer: Buffer): Promise<Buffer> {

    const result = await Compressor.gzipAsync(inputAsBuffer);

    // Casting result to Buffer as that's what is returned by gzip
    return result as Buffer;
  }

  /**
   * Decompresses the input and returns it as buffer.
   */
  public static async decompress (inputAsBuffer: Buffer, maxAllowedDecompressedSizeInBytes: number): Promise<Buffer> {
    // Create a gunzip transform object.
    const gunzip = zlib.createGunzip();

    let content = Buffer.alloc(0);

    // Handle the data chunks that are decompressed as they come in.
    gunzip.on('data', (chunk: Buffer) => {
      const currentContentLength = content.length + chunk.length;

      // If decompressed data exceeded max allowed size, terminate gunzip and throw error.
      if (currentContentLength > maxAllowedDecompressedSizeInBytes) {

        const error = new SidetreeError(
          ErrorCode.CompressorMaxAllowedDecompressedDataSizeExceeded,
          `Max data size allowed: ${maxAllowedDecompressedSizeInBytes} bytes, aborted decompression at ${currentContentLength} bytes.`
        );

        gunzip.destroy(error);
        return;
      }

      content = Buffer.concat([content, chunk]);
    });

    // Create a promise to wrap the successful/failed decompress events.
    const readBody = new Promise((resolve, reject) => {
      gunzip.on('end', resolve);
      gunzip.on('error', reject);
    });

    // Now that we have setup all the call backs, we pass the buffer to be decoded to the writable stream of gunzip Transform.
    gunzip.end(inputAsBuffer);

    // Wait until the read is completed.
    await readBody;

    return content;
  }
}
