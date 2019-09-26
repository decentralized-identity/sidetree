import zlib = require('zlib');
import util = require('util');
import Encoder from '../Encoder';

/**
 * Encapsulates functionality to compress/decompress data.
 */
export default class Compressor {

  private static readonly gzipAsync = util.promisify(zlib.gzip);
  private static readonly gUnzipAsync = util.promisify(zlib.gunzip);

  /**
   * Compresses the data in gzip and returns it as base64url encoded string.
   * @param input The buffer to compress.
   */
  public static async compressAsBase64Url (input: string): Promise<string> {

    const inputAsBuffer = Buffer.from(input);
    const resultAsBuffer = await this.compressAsBuffer(inputAsBuffer);

    return Encoder.encode(resultAsBuffer);
  }

  /**
   * Compresses teh data in gzip and return it as buffer.
   * @param inputAsBuffer The input string to be compressed.
   */
  public static async compressAsBuffer (inputAsBuffer: Buffer): Promise<Buffer> {

    const result = await Compressor.gzipAsync(inputAsBuffer);

    // Casting result to Buffer as that's what is returned by gzip
    return result as Buffer;
  }

  /**
   * Decompresses the base64url encoded input and returns it as a string.
   * @param buffer The gzip compressed buffer as base64url encoded string.
   */
  public static async decompressBase64UrlData (base64UrlInput: string): Promise<string> {

    const inputAsBuffer = Encoder.decodeAsBuffer(base64UrlInput);
    const result = await this.decompressBuffer(inputAsBuffer);

    return result.toString();
  }

  /**
   * Decompresses the input and returns it as buffer.
   * @param inputAsBuffer The gzip compressed data.
   */
  public static async decompressBuffer (inputAsBuffer: Buffer): Promise<Buffer> {

    const result = await Compressor.gUnzipAsync(inputAsBuffer);

    // Casting result to Buffer as that's what is returned by gzip
    return result as Buffer;
  }
}
