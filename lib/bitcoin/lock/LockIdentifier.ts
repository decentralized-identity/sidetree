import base64url from 'base64url';

/**
 * Represents a class which uniquely identifies a lock.
 */
export default class LockIdentifier {

  private static readonly delimeter = '.';

  /** The transaction id of the lock */
  public readonly transactionId: string;

  /** The redeem script to spend the lock */
  public readonly redeemScript: string;

  /** The address to which the redeem script is paying to */
  public readonly walletAddress: Buffer;

  public constructor (transactionId: string, redeemScript: string, walletAddress: Buffer) {
    this.transactionId = transactionId;
    this.redeemScript = redeemScript;
    this.walletAddress = walletAddress;
  }

  /**
   * Returns the string representation of this identifier.
   */
  public serialize (): string {
    const walletAddressAsString = this.walletAddress.toString();
    const delim = LockIdentifier.delimeter;

    const concatenatedData = `${this.transactionId}${delim}${this.redeemScript}${delim}${walletAddressAsString}`;
    return base64url.encode(concatenatedData);
  }

  /**
   * Gets this object from the serialized input.
   * @param serialized The serialized lock.
   */
  public static fromSerialized (serialized: string): LockIdentifier {
    const decodedString = base64url.decode(serialized);
    const splitDecodedString = decodedString.split(LockIdentifier.delimeter);

    if (splitDecodedString.length !== 3) {
      // Throw
    }

    const walletAddressAsString = splitDecodedString[2];
    const walletAddressAsBuffer = Buffer.from(walletAddressAsString);

    return new LockIdentifier(splitDecodedString[0], splitDecodedString[1], walletAddressAsBuffer);
  }
}
