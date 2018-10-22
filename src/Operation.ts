import * as Base58 from 'bs58';
import { DidDocument } from '@decentralized-identity/did-common-typescript';

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
   */
  public constructor (
    /** The original request buffer sent by the requester. */
    public readonly operationBuffer: Buffer,
    /** The transaction number of the transaction this operation was batched within. */
    public readonly transactionNumber?: number,
    /** The index this operation was assigned to in the batch. */
    public readonly operationIndex?: number,
    /** Hash of the batch file that contains this operation */
    public readonly batchFileHash?: string
    ) {
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

    const operationTypeAndDecodedPayload = WriteOperation.getOperationTypeAndDecodedPayload(operation);
    this.type = operationTypeAndDecodedPayload[0];
    const payload = operationTypeAndDecodedPayload[1];

    switch (this.type) {
      case OperationType.Create:
        this.didDocument = WriteOperation.parseCreatePayload(payload);
        break;
      default:
        throw new Error(`Not implemented operation type ${this.type}.`);
    }
  }

  /**
   * Creates a WriteOperation if the request given follows one and only one write operation JSON schema,
   * throws error otherwise.
   * @param transactionNumber The transaction number this operation was batched within. If given, operationIndex must be given else error will be thrown.
   * @param operationIndex The operation index this operation was assigned to in the batch. If given, transactionNumber must be given else error will be thrown.
   */
  public static create (
    operationBuffer: Buffer,
    transactionNumber?: number,
    operationIndex?: number,
    batchFileHash?: string): WriteOperation {
    return new WriteOperation(operationBuffer, transactionNumber, operationIndex, batchFileHash);
  }

  /**
   * Given an operation object, returns a tuple of operation type and the the operation payload.
   */
  private static getOperationTypeAndDecodedPayload (operation: any): [OperationType, object] {
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

    const decodedPayloadBuffer = Base58.decode(encodedPayload);
    const decodedPayloadJson = decodedPayloadBuffer.toString();
    const decodedPayload = JSON.parse(decodedPayloadJson);

    return [operationType, decodedPayload];
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
