import util = require('util');
import zlib = require('zlib');

/**
 * Encapsulates functionality to compress/decompress data.
 */
export default class Compressor {

  private static readonly gzipAsync = util.promisify(zlib.gzip);
  private static readonly gUnzipAsync = util.promisify(zlib.gunzip);

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
   * @param inputAsBuffer The gzip compressed data.
   */
  public static async decompress (inputAsBuffer: Buffer): Promise<Buffer> {

    const result = await Compressor.gUnzipAsync(inputAsBuffer);

    // Casting result to Buffer as that's what is returned by gzip
    return result as Buffer;
  }
}
