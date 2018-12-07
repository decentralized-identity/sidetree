import * as Base58 from 'bs58';

/**
 * Class that encodes binary blobs into strings.
 */
export default class Encoder {
  /**
   * Encodes given Buffer into a Base58 string.
   */
  public static encode (content: Buffer | string): string {
    if (content instanceof Buffer) {
      return Base58.encode(content);
    } else {
      const contentBuffer = Buffer.from(content);
      return Base58.encode(contentBuffer);
    }
  }

  /**
   * Decodes the given Base58 string into a Buffer.
   */
  public static decodeAsBuffer (encodedContent: string): Buffer {
    const decodedContent = Base58.decode(encodedContent);
    return Buffer.from(decodedContent);
  }

  /**
   * Decodes the given Base58 string into a string.
   */
  public static decodeAsString (encodedContent: string): string {
    const decodedContentBuffer = Base58.decode(encodedContent);
    const decodedContent = decodedContentBuffer.toString();
    return decodedContent;
  }
}
