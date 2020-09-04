import CreateOperation from './CreateOperation';
import Delta from './Delta';
import ErrorCode from './ErrorCode';
import Multihash from './Multihash';
import OperationType from '../../enums/OperationType';
import SidetreeError from '../../../common/SidetreeError';
import { URL } from 'url';

/**
 * Class containing reusable Sidetree DID related operations.
 */
export default class Did {

  private static readonly initialStateParameterSuffix = 'initial-state';

  /** `true` if DID is short form; `false` if DID is long-form. */
  public isShortForm: boolean;
  /** DID method name. */
  public didMethodName: string;
  /** DID unique suffix. */
  public uniqueSuffix: string;
  /** The create operation if the DID given is long-form, `undefined` otherwise. */
  public createOperation?: CreateOperation;
  /** The short form. */
  public shortForm: string;
  /** The long form. */
  public longForm: string | undefined;

  /**
   * Parses the input string as Sidetree DID.
   * NOTE: Must not call this constructor directly, use the factory `create` method instead.
   * @param did Short or long-form DID string.
   * @param didMethodName The expected DID method given in the DID string. The method throws SidetreeError if mismatch.
   */
  private constructor (did: string, didMethodName: string) {
    this.didMethodName = didMethodName;
    const didPrefix = `did:${didMethodName}:`;

    if (!did.startsWith(didPrefix)) {
      throw new SidetreeError(ErrorCode.DidIncorrectPrefix);
    }

    const indexOfDotChar = did.indexOf('.');
    // If there is no 'dot', then DID can only be in short-form.
    if (indexOfDotChar < 0) {
      this.isShortForm = true;
    } else {
      this.isShortForm = false;
    }

    if (this.isShortForm) {
      this.uniqueSuffix = did.substring(didPrefix.length);
    } else {
      // Long-form can be in the form of:
      // 'did:<methodName>:<unique-portion>?-<methodName>-initial-state=<create-operation-suffix-data>.<create-operation-delta>' or
      // 'did:<methodName>:<unique-portion>:<create-operation-suffix-data>.<create-operation-delta>'

      const indexOfQuestionMarkChar = did.indexOf('?');
      if (indexOfQuestionMarkChar > 0) {
        this.uniqueSuffix = did.substring(didPrefix.length, indexOfQuestionMarkChar);
      } else {
        this.uniqueSuffix = did.substring(didPrefix.length, did.lastIndexOf(':'));
      }

      this.longForm = did;
    }

    if (this.uniqueSuffix.length === 0) {
      throw new SidetreeError(ErrorCode.DidNoUniqueSuffix);
    }

    this.shortForm = didPrefix + this.uniqueSuffix;
  }

  /**
   * Parses the input string as Sidetree DID.
   * @param didString Short or long-form DID string.
   */
  public static async create (didString: string, didMethodName: string): Promise<Did> {
    const did = new Did(didString, didMethodName);

    // If DID is long-form, ensure the unique suffix constructed from the suffix data matches the short-form DID and populate the `createOperation` property.
    if (!did.isShortForm) {
      // Long-form can be in the form of:
      // 'did:<methodName>:<unique-portion>?-<methodName>-initial-state=<create-operation-suffix-data>.<create-operation-delta>' or
      // 'did:<methodName>:<unique-portion>:<create-operation-suffix-data>.<create-operation-delta>'

      const indexOfQuestionMarkChar = didString.indexOf('?');
      let initialState;
      if (indexOfQuestionMarkChar > 0) {
        initialState = Did.getInitialStateFromDidStringWithQueryParameter(didString, didMethodName);
      } else {
        initialState = Did.getInitialStateFromDidStringWithExtraColon(didString);
      }

      const createOperation = await Did.constructCreateOperationFromInitialState(initialState);

      // NOTE: we cannot use the unique suffix directly from `createOperation.didUniqueSuffix` for comparison,
      // because a given long-form DID may have been created long ago,
      // thus this version of `CreateOperation.parse()` maybe using a different hashing algorithm than that of the unique DID suffix (short-form).
      // So we compute the suffix data hash again using the hashing algorithm used by the given unique DID suffix (short-form).
      const suffixDataHashMatchesUniqueSuffix = Multihash.isValidHash(createOperation.encodedSuffixData, did.uniqueSuffix);

      // If the computed suffix data hash is not the same as the unique suffix given in the DID string, the DID is not valid.
      if (!suffixDataHashMatchesUniqueSuffix) {
        throw new SidetreeError(ErrorCode.DidUniqueSuffixFromInitialStateMismatch);
      }

      did.createOperation = createOperation;
    }

    return did;
  }

  private static getInitialStateFromDidStringWithQueryParameter (didString: string, methodNameWithNetworkId: string): string {
    let didStringUrl = undefined;
    try {
      didStringUrl = new URL(didString);
    } catch {
      throw new SidetreeError(ErrorCode.DidInvalidDidString);
    }

    // TODO: #470 - Support/disambiguate "network ID" in method name.

    // Stripping away the potential network ID portion. e.g. 'sidetree:test' -> 'sidetree'
    const methodName = methodNameWithNetworkId.split(':')[0];

    let queryParamCounter = 0;
    let initialStateValue;

    // Verify that `-<method-name>-initial-state` is the one and only parameter.
    for (const [key, value] of didStringUrl.searchParams) {
      queryParamCounter += 1;
      if (queryParamCounter > 1) {
        throw new SidetreeError(ErrorCode.DidLongFormOnlyOneQueryParamAllowed);
      }

      // expect key to be -<method-name>-initial-state
      const expectedKey = `-${methodName}-${Did.initialStateParameterSuffix}`;
      if (key !== expectedKey) {
        throw new SidetreeError(ErrorCode.DidLongFormOnlyInitialStateParameterIsAllowed);
      }

      initialStateValue = value;
    }

    if (initialStateValue === undefined) {
      throw new SidetreeError(ErrorCode.DidLongFormNoInitialStateFound);
    }

    return initialStateValue;
  }

  private static getInitialStateFromDidStringWithExtraColon (didString: string): string {
    // DID example: 'did:<methodName>:<unique-portion>:<create-operation-suffix-data>.<create-operation-delta>'

    const lastColonIndex = didString.lastIndexOf(':');

    const initialStateValue = didString.substring(lastColonIndex + 1);

    return initialStateValue;
  }

  private static async constructCreateOperationFromInitialState (initialState: string): Promise<CreateOperation> {
    // Initial state should be in the format: <suffix-data>.<delta>
    const firstIndexOfDot = initialState.indexOf('.');
    if (firstIndexOfDot === -1) {
      throw new SidetreeError(ErrorCode.DidInitialStateValueContainsNoDot);
    }

    const lastIndexOfDot = initialState.lastIndexOf('.');
    if (lastIndexOfDot !== firstIndexOfDot) {
      throw new SidetreeError(ErrorCode.DidInitialStateValueContainsMoreThanOneDot);
    }

    if (firstIndexOfDot === (initialState.length - 1) ||
        firstIndexOfDot === 0) {
      throw new SidetreeError(ErrorCode.DidInitialStateValueDoesNotContainTwoParts);
    }

    const initialStateParts = initialState.split('.');
    const suffixData = initialStateParts[0];
    const delta = initialStateParts[1];

    Delta.validateEncodedDeltaSize(delta);

    const createOperationRequest = {
      type: OperationType.Create,
      suffix_data: suffixData,
      delta
    };
    const createOperationBuffer = Buffer.from(JSON.stringify(createOperationRequest));
    const createOperation = await CreateOperation.parseObject(createOperationRequest, createOperationBuffer, false);

    return createOperation;
  }
}
