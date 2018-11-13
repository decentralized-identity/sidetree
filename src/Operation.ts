import * as Base58 from 'bs58';
import Multihash from './Multihash';
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
  /** The blockchain block number that contains the transaction that contains this operation. */
  public readonly blockNumber?: number;
  /** The transaction number of the transaction this operation was batched within. */
  public readonly transactionNumber?: number;
  /** The index this operation was assigned to in the batch. */
  public readonly operationIndex?: number;
  /** The hash of the batch file this operation belongs to */
  public readonly batchFileHash?: string;
  /** The original request buffer sent by the requester. */
  public readonly operationBuffer: Buffer;
  /** The Base58 encoded operation payload. */
  public readonly encodedPayload: string;
  /** The DID of the DID document to be updated. */
  public readonly did: string | undefined;
  /** The type of operation. */
  public readonly type: OperationType;
  /** The hash of the previous operation - undefined for DID create operation */
  public readonly previousOperationHash?: string;
  /** ID of the key used to sign this operation. */
  public readonly signingKeyId: string;
  /** Signature of this operation. */
  public readonly signature: Buffer;
  /** Proof-of-work of this operation. */
  public proofOfWork: any; // TODO: to be implemented.

  /** DID document given in the operation, only applicable to create and recovery operations, undefined otherwise. */
  public readonly didDocument: DidDocument | undefined;

  /**
   * Constructs a WriteOperation if the request given follows one and only one write operation JSON schema,
   * throws error otherwise.
   * @param resolvedTransaction The transaction operation was batched within. If given, operationIndex must be given else error will be thrown.
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

    // Properties if the operation comes from a resolved transaction.
    this.blockNumber = resolvedTransaction ? resolvedTransaction.blockNumber : undefined;
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
      OperationProperty.proofOfWork]);
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
    const decodedPayloadBuffer = Base58.decode(encodedPayload);
    const decodedPayloadJson = decodedPayloadBuffer.toString();
    const decodedPayload = JSON.parse(decodedPayloadJson);

    switch (this.type) {
      case OperationType.Create:
        this.didDocument = WriteOperation.parseCreatePayload(decodedPayload);
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
   * Retuns the constructed DID Document from the given create operation.
   * Throws error if the given operation is not a create operation or if unable to locate a block number to be used for DID generation.
   * @param blockNumber Optional. Will be used to decide protocol version to use for DID generation.
   *                    If not given operation.blockNumber must be given and will be used instead.
   */
  public static toDidDocument (operation: WriteOperation, didMethodName: string, blockNumber?: number): DidDocument {
    if (operation.type !== OperationType.Create) {
      throw new Error(`Unable to construct a DID Document from a '${operation.type}' operation.`);
    }

    if (blockNumber === undefined) {
      blockNumber = operation.blockNumber;
    }

    if (blockNumber === undefined) {
      throw new Error(`Block number not found but needed for DID generation.`);
    }

    // Get the protocol version according to current block number to decide on the hashing algorithm used for the DID.
    const protocol = getProtocol(blockNumber);

    // Compute the hash of the DID Document in the create payload as the DID
    const didDocumentBuffer = Buffer.from(operation.encodedPayload);
    const multihash = Multihash.hash(didDocumentBuffer, protocol.hashAlgorithmInMultihashCode);
    const multihashBase58 = Base58.encode(multihash);
    const did = didMethodName + multihashBase58;

    // Construct real DID document and return it.
    const didDocument = operation.didDocument!;
    didDocument.id = did;
    return didDocument;
  }

  /**
   * Given an operation object, returns a tuple of operation type and the Base58 encoded operation payload.
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

  /**
   * Parses the given create payload into a DidDocument.
   */
  private static parseCreatePayload (payload: any): DidDocument {
    // DidDocument class requires 'id' property, where as Sidetree does not.
    // So here we make sure the 'id' property is added before passing to DidDocument constructor.
    payload.id = 'disregard';
    return new DidDocument(payload);
  }
}

export { OperationType, WriteOperation };
