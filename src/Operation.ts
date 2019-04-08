import Cryptography from './lib/Cryptography';
import Document, { IDocument } from './lib/Document';
import Encoder from './Encoder';
import Multihash from './Multihash';
import { applyPatch } from 'fast-json-patch';
import { DidPublicKey } from '@decentralized-identity/did-common-typescript';
import { getProtocol } from './Protocol';
import { PrivateKey } from '@decentralized-identity/did-auth-jose';
import { ResolvedTransaction } from './Transaction';

/**
 * Sidetree operation types.
 */
enum OperationType {
  Create,
  Update,
  Delete,
  Recover
}

/**
 * Defines operation request data structure for basic type safety checks.
 */
interface IOperation {
  header: {
    operation: string,
    kid: string,
    proofOfWork: object
  };
  payload: string;
  signature: string;
}

/**
 * A class that represents a Sidetree operation.
 * The primary purphose of this class is to provide an abstraction to the underlying JSON data structure.
 *
 * NOTE: Design choices of:
 * 1. No subclassing of specific operations. The intention here is to keep the hierarchy flat, as most properties are common.
 * 2. Factory method to hide constructor in case subclassing becomes useful in the future. Most often a good practice anyway.
 */
class Operation {
  /** The logical blockchain time that this opeartion was anchored on the blockchain */
  public readonly transactionTime?: number;
  /** The transaction number of the transaction this operation was batched within. */
  public readonly transactionNumber?: number;
  /** The index this operation was assigned to in the batch. */
  public readonly operationIndex?: number;
  /** The hash of the batch file this operation belongs to */
  public readonly batchFileHash?: string;

  /** The original request buffer sent by the requester. */
  public readonly operationBuffer: Buffer;

  /**
   * The incremental number of each update made to the same DID Document.
   * Delete and Recover operations don't have this number.
   */
  public readonly operationNumber?: Number;
  /** The encoded operation payload. */
  public readonly encodedPayload: string;
  /** The unique suffix of the DID of the DID document to be created/updated. */
  public readonly didUniqueSuffix?: string;
  /** The type of operation. */
  public readonly type: OperationType;
  /** The hash of the previous operation - undefined for DID create operation */
  public readonly previousOperationHash?: string;
  /** ID of the key used to sign this operation. */
  public readonly signingKeyId: string;
  /** Signature of this operation. */
  public readonly signature: string;
  /** Proof-of-work of this operation. */
  public proofOfWork: any; // TODO: to be implemented.

  /** DID document given in the operation, only applicable to create and recovery operations, undefined otherwise. */
  public readonly didDocument?: IDocument;

  /** Patch to the DID Document, only applicable to update operations, undefined otherwise. */
  public readonly patch?: any[];

  /**
   * Constructs an Operation if the operation buffer passes schema validation, throws error otherwise.
   * @param resolvedTransaction The transaction operation this opeartion was batched within.
   *                            If given, operationIndex must be given else error will be thrown.
   *                            The transactoinTimeHash is ignored by the constructor.
   * @param operationIndex The operation index this operation was assigned to in the batch.
   *                       If given, resolvedTransaction must be given else error will be thrown.
   */
  private constructor (
    operationBuffer: Buffer,
    resolvedTransaction?: ResolvedTransaction,
    operationIndex?: number) {
    // resolvedTransaction and operationIndex must both be defined or undefined at the same time.
    if (!((resolvedTransaction === undefined && operationIndex === undefined) ||
          (resolvedTransaction !== undefined && operationIndex !== undefined))) {
      throw new Error('Param transactionNumber and operationIndex must both be defined or undefined.');
    }

    // Properties of an operation in a resolved transaction.
    this.transactionTime = resolvedTransaction ? resolvedTransaction.transactionTime : undefined;
    this.transactionNumber = resolvedTransaction ? resolvedTransaction.transactionNumber : undefined;
    this.batchFileHash = resolvedTransaction ? resolvedTransaction.batchFileHash : undefined;

    this.operationIndex = operationIndex;
    this.operationBuffer = operationBuffer;

    // Parse request buffer into a JS object.
    const operationJson = operationBuffer.toString();
    const operation = JSON.parse(operationJson);

    // Ensure that the operation is well-formed.
    const wellFormedResult = Operation.isWellFormed(operation);
    if (wellFormedResult === undefined) {
      throw new Error(`Operation buffer is not well-formed: ${operationJson}`);
    }

    // Initialize common operation properties.
    const [operationType, decodedPayload] = wellFormedResult;
    this.type = operationType;
    this.signingKeyId = operation.header.kid;
    this.proofOfWork = operation.header.proofOfWork;
    this.encodedPayload = operation.payload;
    this.signature = operation.signature;

    // Initialize operation specific properties.
    switch (this.type) {
      case OperationType.Create:
        this.operationNumber = 0;
        if (this.transactionTime !== undefined) {
          this.didUniqueSuffix = this.getOperationHash();
        }
        break;
      case OperationType.Update:
        this.operationNumber = decodedPayload.operationNumber;
        this.didUniqueSuffix = decodedPayload.didUniqueSuffix;
        this.previousOperationHash = decodedPayload.previousOperationHash;
        this.patch = decodedPayload.patch;
        break;
      case OperationType.Delete:
        this.didUniqueSuffix = decodedPayload.didUniqueSuffix;
        break;
      default:
        throw new Error(`Not implemented operation type ${this.type}.`);
    }
  }

  /**
   * Creates an Operation if the given operation buffer passes schema validation, throws error otherwise.
   * @param resolvedTransaction The transaction operation was batched within. If given, operationIndex must be given else error will be thrown.
   * @param operationIndex The operation index this operation was assigned to in the batch.
   *                       If given, resolvedTransaction must be given else error will be thrown.
   */
  public static create (
    operationBuffer: Buffer,
    resolvedTransaction?: ResolvedTransaction,
    operationIndex?: number): Operation {
    return new Operation(operationBuffer, resolvedTransaction, operationIndex);
  }

  /**
   * Verifies the operation is signed correctly.
   * @param publicKey The public key used for verification.
   * @returns true if signature is successfully verified, false otherwise.
   */
  public async verifySignature (publicKey: DidPublicKey): Promise<boolean> {
    // JWS Signing Input spec: ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))
    // NOTE: there is no protected header in Sidetree operation.
    const jwsSigningInput = '.' + this.encodedPayload;
    const verified = await Cryptography.verifySignature(jwsSigningInput, this.signature, publicKey);
    return verified;
  }

  /**
   * Signs the given encoded payload using the given private key.
   * @param privateKey A SECP256K1 private-key either in HEX string format or JWK format.
   */
  public static async sign (encodedPayload: string, privateKey: string | PrivateKey): Promise<string> {
    // JWS Signing Input spec: ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))
    // NOTE: there is no protected header in Sidetree operation.
    const jwsSigningInput = '.' + encodedPayload;
    const signature = await Cryptography.sign(jwsSigningInput, privateKey);
    return signature;
  }

  /**
   * Gets a cryptographic hash of the operation payload.
   */
  public getOperationHash (): string {
    if (this.transactionTime === undefined) {
      throw new Error(`Transaction time not given but needed for hash algorithm selection.`);
    }

    // Get the protocol version according to the transaction time to decide on the hashing algorithm used for the DID.
    const protocol = getProtocol(this.transactionTime);

    const encodedOperationPayloadBuffer = Buffer.from(this.encodedPayload);
    const multihash = Multihash.hash(encodedOperationPayloadBuffer, protocol.hashAlgorithmInMultihashCode);
    const encodedMultihash = Encoder.encode(multihash);
    return encodedMultihash;
  }

  /**
   * Applies the given JSON Patch to the specified DID Document.
   * NOTE: a new instance of the DidDocument is returned, the original instance is not modified.
   * @returns The resultant DID Document.
   */
  public static applyJsonPatchToDidDocument (didDocument: IDocument, jsonPatch: any[]): IDocument {
    const validatePatchOperation = true;
    const mutateOriginalContent = false;
    const updatedDidDocument = applyPatch(didDocument, jsonPatch, validatePatchOperation, mutateOriginalContent);

    return updatedDidDocument.newDocument;
  }

  /**
   * Gets the operation type given an operation object.
   */
  private static getOperationType (operation: IOperation): OperationType {
    switch (operation.header.operation) {
      case 'create':
        return OperationType.Create;
      case 'update':
        return OperationType.Update;
      case 'delete':
        return OperationType.Delete;
      case 'recover':
        return OperationType.Recover;
      default:
        throw new Error(`Unknown operation type: ${operation.header.operation}`);
    }
  }

  /**
   * Verifies if the given operation object is well-formed.
   * NOTE: Well-formed validation does not include signature verification.
   * @returns [operation type, decoded payload json object] if given operation is well-formed, returns undefined otherwise.
   */
  private static isWellFormed (operation: any): [OperationType, any] | undefined {
    try {
      // Must contain 'header' property and 'header' property must contain a string 'kid' property.
      if (typeof operation.header.kid !== 'string') {
        return undefined;
      }

      // 'header' property must contain 'alg' property with value 'ES256k'.
      if (operation.header.alg !== 'ES256K') {
        return undefined;
      }

      // 'operation' property must exist inside 'header' property and must be one of the allowed strings.
      const allowedOperations = new Set(['create', 'update', 'delete', 'recover']);
      if (typeof operation.header.operation !== 'string' ||
          !allowedOperations.has(operation.header.operation)) {
        return undefined;
      }

      // Must contain string 'payload' property.
      if (typeof operation.payload !== 'string') {
        return undefined;
      }

      // Must contain string 'signature' property.
      if (typeof operation.signature !== 'string') {
        return undefined;
      }

      // Get the operation type.
      const operationType = Operation.getOperationType(operation);

      // Decode the encoded operation string.
      const decodedPayloadJson = Encoder.decodeAsString(operation.payload);
      const decodedPayload = JSON.parse(decodedPayloadJson);

      // Verify operation specific payload schema.
      let payloadSchemaIsValid;
      switch (operationType) {
        case OperationType.Create:
          payloadSchemaIsValid = Document.isObjectValidOriginalDocument(decodedPayload);
          break;
        default:
          payloadSchemaIsValid = true;
      }

      if (!payloadSchemaIsValid) {
        console.info(`${OperationType[operationType]} payload failed schema validation: ${decodedPayloadJson}`);
        return undefined;
      }

      return [operationType, decodedPayload];
    } catch (error) {
      console.info(`Operation failed schema validation: ${JSON.stringify(operation)}`);
      return undefined;
    }
  }
}

export { IOperation, OperationType, Operation };
