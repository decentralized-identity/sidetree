import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import Multihash from './Multihash';
import { SidetreeError } from '../../Error';

/**
 * Class containing reusable Sidetree DID related operations.
 */
export default class Did {
  private static readonly initialValuesParameterPrefix = 'initial-values=';

  /** `true` if DID is short form; `false` if DID is long-form. */
  public isShortForm: boolean;
  /** DID method name. */
  public didMethodName: string;
  /** DID unique suffix. */
  public uniqueSuffix: string;
  /** Encoded DID Document if given DID is long-form, `undefined` otherwise. */
  public encodedDidDocument?: string;
  /** The short form. */
  public shortForm: string;

  /**
   * Parses the input string as Sidetree DID.
   * @param did Short or long-form DID string.
   * @param didMethodName The expected DID method given in the DID string. The method throws SidetreeError if mismatch.
   */
  private constructor(did: string, didMethodName: string) {
    if (!did.startsWith(didMethodName)) {
      throw new SidetreeError(ErrorCode.DidIncorrectPrefix);
    }

    this.didMethodName = didMethodName;

    const indexOfSemiColonChar = did.indexOf(';');
    // If there is no semicolon, then DID can only be in short-form.
    if (indexOfSemiColonChar < 0) {
      this.isShortForm = true;
    } else {
      this.isShortForm = false;
    }

    if (this.isShortForm) {
      this.uniqueSuffix = did.substring(didMethodName.length);
    } else {
      // This is long-form.
      this.uniqueSuffix = did.substring(
        didMethodName.length,
        indexOfSemiColonChar
      );
    }

    if (this.uniqueSuffix.length === 0) {
      throw new SidetreeError(ErrorCode.DidNoUniqueSuffix);
    }

    this.shortForm = didMethodName + this.uniqueSuffix;

    // Get the encoded document if it's long-form.
    if (!this.isShortForm) {
      const didParameterString = did.substring(indexOfSemiColonChar + 1);

      if (!didParameterString.startsWith(Did.initialValuesParameterPrefix)) {
        throw new SidetreeError(
          ErrorCode.DidLongFormOnlyInitialValuesParameterIsAllowed
        );
      }

      // Trim the `initial-values=` string to get the full initial DID DOcument.
      this.encodedDidDocument = didParameterString.substring(
        Did.initialValuesParameterPrefix.length
      );

      // Ensure that the encoded DID document hash matches the DID unique Suffix.
      const uniqueSuffixBuffer = Encoder.decodeAsBuffer(this.uniqueSuffix);
      const hashAlgorithmCode = Multihash.getHashAlgorithmCode(
        uniqueSuffixBuffer
      );
      const encodedDidDocumentBuffer = Buffer.from(this.encodedDidDocument);
      const multihash = Multihash.hash(
        encodedDidDocumentBuffer,
        hashAlgorithmCode
      );

      // If the computed unique suffix is not the same as the unique suffix in given short-form DID.
      if (Buffer.compare(uniqueSuffixBuffer, multihash) !== 0) {
        throw new SidetreeError(ErrorCode.DidEncodedDidDocumentHashMismatch);
      }
    }
  }

  /**
   * Parses the input string as Sidetree DID.
   * @param did Short or long-form DID string.
   */
  public static create(did: string, didMethodName: string): Did {
    return new Did(did, didMethodName);
  }

  /**
   * Creates a long-form DID string.
   * ie. 'did:sidetree:<unique-portion>;initial-values=<encoded-original-did-document>'
   */
  public static createLongFormDidString(
    didMethodName: string,
    originalDidDocument: any,
    hashAlgorithmInMultihashCode: number
  ): string {
    const encodedOriginalDidDocument = Encoder.encode(
      JSON.stringify(originalDidDocument)
    );
    const documentHash = Multihash.hash(
      Buffer.from(encodedOriginalDidDocument),
      hashAlgorithmInMultihashCode
    );
    const didUniqueSuffix = Encoder.encode(documentHash);
    const did = `${didMethodName}${didUniqueSuffix};${Did.initialValuesParameterPrefix}${encodedOriginalDidDocument}`;
    return did;
  }
  /**
   * Gets the unique portion of the DID generated from an encoded DID Document. e.g. "did:sidetree:12345" -> "12345"
   */
  public static getUniqueSuffixFromEncodeDidDocument(
    encodedDidDocument: string,
    hashAlgorithmAsMultihashCode: number
  ): string {
    const didDocumentBuffer = Buffer.from(encodedDidDocument);
    const multihash = Multihash.hash(
      didDocumentBuffer,
      hashAlgorithmAsMultihashCode
    );
    const encodedMultihash = Encoder.encode(multihash);
    return encodedMultihash;
  }
}
