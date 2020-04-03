import base64url from 'base64url';
import ErrorCode from './ErrorCode';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Class that encodes binary blobs into strings.
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
   * Decodes the given Base64URL string into a string.
   */
  public static decodeAsString (encodedContent: string): string {
    Encoder.validateBase64UrlString(encodedContent);

    const content = base64url.decode(encodedContent);
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

    // '/<expression>/ denotes regex.
    // ^ denotes beginning of string.
    // $ denotes end of string.
    // + denotes one or more characters.
    const isBase64UrlString = /^[A-Za-z0-9_-]+$/.test(input);
    if (!isBase64UrlString) {
      throw new SidetreeError(ErrorCode.EncoderValidateBase64UrlStringInputNotBase64UrlString, `Input '${input}' not a Base64URL string.`);
    }
  }
}
