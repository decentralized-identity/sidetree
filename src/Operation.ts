import Encoder from './Encoder';
import Multihash from './Multihash';
import { applyPatch } from 'fast-json-patch';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { getProtocol } from './Protocol';
import { ResolvedTransaction } from './Transaction';

/**
 * Class that contains property names used in the operation requests specified in Sidetree REST API.
 */
class OperationProperty {
  /** signingKeyId */
  static signingKeyId = 'signingKeyId';
  /** createPayload */
  static createPayload = 'createPayload';
  /** updatePayload */
  static updatePayload = 'updatePayload';
  /** deletePayload */
  static deletePayload = 'deletePayload';
  /** recoverPayload */
  static recoverPayload = 'recoverPayload';
  /** signature */
  static signature = 'signature';
  /** proofOfWork */
  static proofOfWork = 'proofOfWork';
  /** previous operation hash */
  static previousOperationHash = 'previousOperationHash';
}

/**
 * Sidetree operation types.
 */
enum OperationType {
  Create,
  Resolve,
  Update,
  Delete,
  Recover
}

/**
 * A class that represents a Sidetree write operation.
 * The primary purphose of this class is to provide an abstraction to the underlying JSON data structure.
 *
 * NOTE: Design choices of:
 * 1. Excluding resolve/read operation as it is currently very different, ie. far simpler than write operations.
 * 2. No subclassing of specific operations. The intention here is to keep the hierarchy flat, as most properties are common.
 * 3. Factory method to hide constructor in case subclassing becomes useful in the future. Most often a good practice anyway.
 */
class WriteOperation {
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
   * TODO: need to revisit: 1. Should this really be called update number? What happens to this number.
   */
  public readonly operationNumber?: Number;
  /** The encoded operation payload. */
  public readonly encodedPayload: string;
  /** The DID of the DID document to be updated. */
  public readonly did?: string;
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
  public readonly didDocument?: DidDocument;

  /** Patch to the DID Document, only applicable to update operations, undefined otherwise. */
  public readonly patch?: any[];

  /**
   * Constructs a WriteOperation if the request given follows one and only one write operation JSON schema,
   * throws error otherwise.
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
    const operation = JSON.parse(operationBuffer.toString());

    // Ensure all properties given are specified in Sidetree protocol.
    const allowedProperties = new Set([
      OperationProperty.signingKeyId,
      OperationProperty.createPayload,
      OperationProperty.updatePayload,
      OperationProperty.deletePayload,
      OperationProperty.recoverPayload,
      OperationProperty.signature,
      OperationProperty.proofOfWork,
      OperationProperty.previousOperationHash]);
    for (let property in operation) {
      if (!allowedProperties.has(property)) {
        throw new Error(`Unexpected property ${property} in operation.`);
      }
    }

    // Verify required properties.
    const requiredProperties = [OperationProperty.signature, OperationProperty.proofOfWork];
    for (let requiredProperty of requiredProperties) {
      if (!(requiredProperty in operation)) {
        throw new Error(`Required property ${requiredProperty} not found in operation.`);
      }
    }

    // Verify that operation must contain one of the mutually exclusive properties.
    const mutuallyExclusiveProperties = [
      OperationProperty.createPayload,
      OperationProperty.updatePayload,
      OperationProperty.deletePayload,
      OperationProperty.recoverPayload];
    let mutuallyExclusivePropertyFound = false;
    for (let property of mutuallyExclusiveProperties) {
      if (property in operation) {
        if (mutuallyExclusivePropertyFound) {
          throw new Error('More than one mutually exclusive property found in operation.');
        } else {
          mutuallyExclusivePropertyFound = true;
        }
      }
    }
    if (!mutuallyExclusivePropertyFound) {
      throw new Error(`Must contain one of the '${mutuallyExclusiveProperties.join(', ')}' properties in request.`);
    }

    this.signingKeyId = operation.signingKeyId;
    this.signature = operation.signature;
    this.proofOfWork = operation.proofOfWork;

    // Get the operation type and encoded operation string.
    const [operationType, encodedPayload] = WriteOperation.getOperationTypeAndEncodedPayload(operation);
    this.type = operationType;
    this.encodedPayload = encodedPayload;

    // Decode the encoded operation string.
    const decodedPayloadJson = Encoder.decodeAsString(encodedPayload);
    const decodedPayload = JSON.parse(decodedPayloadJson);

    switch (this.type) {
      case OperationType.Create:
        this.operationNumber = 0;
        break;
      case OperationType.Update:
        this.operationNumber = decodedPayload.operationNumber;
        this.did = decodedPayload.did;
        this.previousOperationHash = decodedPayload.previousOperationHash;
        this.patch = decodedPayload.patch;
        break;
      case OperationType.Delete:
        this.did = decodedPayload.did;
        break;
      default:
        throw new Error(`Not implemented operation type ${this.type}.`);
    }
  }

  /**
   * Creates a WriteOperation if the request given follows one and only one write operation JSON schema,
   * throws error otherwise.
   * @param resolvedTransaction The transaction operation was batched within. If given, operationIndex must be given else error will be thrown.
   * @param operationIndex The operation index this operation was assigned to in the batch.
   *                       If given, resolvedTransaction must be given else error will be thrown.
   */
  public static create (
    operationBuffer: Buffer,
    resolvedTransaction?: ResolvedTransaction,
    operationIndex?: number): WriteOperation {
    return new WriteOperation(operationBuffer, resolvedTransaction, operationIndex);
  }

  /**
   * Applies the given JSON Patch to the specified DID Document.
   * NOTE: a new instance of the DidDocument is returned, the original instance is not modified.
   * @returns The resultant DID Document.
   */
  public static applyJsonPatchToDidDocument (didDocument: DidDocument, jsonPatch: any[]): DidDocument {
    const validatePatchOperation = true;
    const mutateOriginalContent = false;
    const updatedDidDocument = applyPatch(didDocument, jsonPatch, validatePatchOperation, mutateOriginalContent);
    // TODO: Need to add extensive tests to make sure validation follows protocol behavior.

    return updatedDidDocument.newDocument;
  }

  /**
   * Given an operation object, returns a tuple of operation type and the encoded operation payload.
   */
  private static getOperationTypeAndEncodedPayload (operation: any): [OperationType, string] {
    let operationType;
    let encodedPayload;
    if (operation.hasOwnProperty(OperationProperty.createPayload)) {
      operationType = OperationType.Create;
      encodedPayload = operation.createPayload;
    } else if (operation.hasOwnProperty(OperationProperty.updatePayload)) {
      operationType = OperationType.Update;
      encodedPayload = operation.updatePayload;
    } else if (operation.hasOwnProperty(OperationProperty.deletePayload)) {
      operationType = OperationType.Delete;
      encodedPayload = operation.deletePayload;
    } else if (operation.hasOwnProperty(OperationProperty.recoverPayload)) {
      operationType = OperationType.Recover;
      encodedPayload = operation.recoverPayload;
    } else {
      throw new Error('Unknown operation.');
    }

    return [operationType, encodedPayload];
  }
}

/**
 * Get a cryptographic hash of the write operation.
 * In the case of a Create operation, the hash is calculated against the initial encoded create payload (DID Document),
 * for all other cases, the hash is calculated against the entire opeartion buffer.
 */
function getOperationHash (operation: WriteOperation): string {

  if (operation.transactionTime === undefined) {
    throw new Error(`Transaction time not given but needed for DID generation.`);
  }

  // Get the protocol version according to the transaction time to decide on the hashing algorithm used for the DID.
  const protocol = getProtocol(operation.transactionTime);

  let contentBuffer;
  if (operation.type === OperationType.Create) {
    contentBuffer = Buffer.from(operation.encodedPayload);
  } else {
    contentBuffer = operation.operationBuffer;
  }

  const multihash = Multihash.hash(contentBuffer, protocol.hashAlgorithmInMultihashCode);
  const encodedMultihash = Encoder.encode(multihash);
  return encodedMultihash;
}

export { getOperationHash, OperationType, WriteOperation };
