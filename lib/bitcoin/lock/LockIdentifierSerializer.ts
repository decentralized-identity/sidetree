import base64url from 'base64url';
import BitcoinError from '../BitcoinError';
import LockIdentifier from '../models/LockIdentifierModel';
import ErrorCode from '../ErrorCode';

/**
 * Encapsulates functionality to serialize and deserialize a lock identifier.
 */
export default class LockIdentifierSerializer {

  private static readonly delimiter = '.';

  /**
   * Returns the string representation of this identifier.
   */
  public static serialize (lockIdentifier: LockIdentifier): string {
    const walletAddressAsString = lockIdentifier.walletAddressAsBuffer.toString();
    const delim = LockIdentifierSerializer.delimiter;

    const concatenatedData = `${lockIdentifier.transactionId}${delim}${lockIdentifier.redeemScriptAsHex}${delim}${walletAddressAsString}`;
    return base64url.encode(concatenatedData);
  }

  /**
   * Gets this object from the serialized input.
   * @param serialized The serialized lock.
   */
  public static deserialize (serialized: string): LockIdentifier {
    const decodedString = base64url.decode(serialized);
    const splitDecodedString = decodedString.split(LockIdentifierSerializer.delimiter);

    if (splitDecodedString.length !== 3) {
      throw new BitcoinError(ErrorCode.LockIdentifierIncorrectFormat);
    }

    const walletAddressAsString = splitDecodedString[2];
    const walletAddressAsBuffer = Buffer.from(walletAddressAsString);

    return {
      transactionId: splitDecodedString[0],
      redeemScriptAsHex: splitDecodedString[1],
      walletAddressAsBuffer: walletAddressAsBuffer
    };
  }
}
