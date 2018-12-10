import base64url from 'base64url';

/**
 * Class that encodes binary blobs into strings.
 */
export default class Encoder {
  /**
   * Encodes given Buffer into a Base64URL string.
   */
  public static encode (content: Buffer | string): string {
    return base64url.encode(content);
  }

  /**
   * Decodes the given Base64URL string into a Buffer.
   */
  public static decodeAsBuffer (encodedContent: string): Buffer {
    return Buffer.from(base64url.decode(encodedContent));
  }

  /**
   * Decodes the given Base64URL string into a string.
   */
  public static decodeAsString (encodedContent: string): string {
    return base64url.decode(encodedContent);
  }
}
