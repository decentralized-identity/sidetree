import base64url from 'base64url';
import ErrorCode from './ErrorCode';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Class that encodes binary blobs into strings.
 * Note that the encode/decode methods may change underlying encoding scheme.
 */
export default class Encoder {
  /**
   * Encodes given Buffer into a Base64URL string.
   */
  public static encode (content: Buffer | string): string {
    const encodedContent = base64url.encode(content);
    return encodedContent;
  }

  /**
   * Decodes the given Base64URL string into a Buffer.
   */
  public static decodeAsBuffer (encodedContent: string): Buffer {
    Encoder.validateBase64UrlString(encodedContent);

    const content = base64url.toBuffer(encodedContent);
    return content;
  }

  /**
   * Decodes the given input into the original string.
   */
  public static decodeAsString (encodedContent: string): string {
    return Encoder.decodeBase64UrlAsString(encodedContent);
  }

  /**
   * Decodes the given Base64URL string into the original string.
   */
  public static decodeBase64UrlAsString (input: string): string {
    Encoder.validateBase64UrlString(input);

    const content = base64url.decode(input);
    return content;
  }

  /**
   * Validates if the given input is a Base64URL string.
   * undefined is considered not a valid Base64URL string.
   * NOTE: input is `any` type to handle cases when caller passes input directly from JSON.parse() as `any`.
   * @throws SidetreeError if input is not a Base64URL string.
   */
  private static validateBase64UrlString (input: any) {
    if (typeof input !== 'string') {
      throw new SidetreeError(ErrorCode.EncoderValidateBase64UrlStringInputNotString, `Input '${input}' not a string.`);
    }

    const isBase64UrlString = Encoder.isBase64UrlString(input);
    if (!isBase64UrlString) {
      throw new SidetreeError(ErrorCode.EncoderValidateBase64UrlStringInputNotBase64UrlString, `Input '${input}' not a Base64URL string.`);
    }
  }

  /**
   * Tests if the given string is a Base64URL string.
   */
  public static isBase64UrlString (input: string): boolean {
    // NOTE:
    // '/<expression>/ denotes regex.
    // ^ denotes beginning of string.
    // $ denotes end of string.
    // + denotes one or more characters.
    const isBase64UrlString = /^[A-Za-z0-9_-]+$/.test(input);
    return isBase64UrlString;
  }
}
