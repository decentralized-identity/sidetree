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
  /** The original request buffer sent by the requester. */
  public readonly request: Buffer;
  /** The DID of the DID document to be updated. */
  public readonly did: string;
  /** The incrementing number of this operation. */
  public readonly operationNumber: number;
  /** The type of operation. */
  public readonly type: OperationType;
  /** The hash of the previous opeartion. */
  public readonly perviousOperationHash: Buffer | undefined;
  /** ID of the key used to sign this operation. */
  public readonly signingKeyId: string;
  /** Signature of this operation. */
  public readonly signature: Buffer;
  /** Proof-of-work of this operation. */
  public proofOfWork: any; // TODO: to be implemented.

  /** DID document of the opeartion, only applicable to create and recovery operations, undefined otherwise. */
  public readonly didDocument: DidDocument | undefined;

  /**
   * Constructs a WriteOperation if the request given follows one and only one write operation JSON schema,
   * throws error otherwise.
   */
  private constructor (request: Buffer) {
    this.request = request;

    // Parse request buffer into a JS object.
    const operation = JSON.parse(request.toString());

    // Ensure all properties given are specified in Sidetree protocol.
    const allowedProperties = [
      OperationProperty.signingKeyId,
      OperationProperty.createPayload,
      OperationProperty.updatePayload,
      OperationProperty.deletePayload,
      OperationProperty.recoverPayload,
      OperationProperty.signature,
      OperationProperty.proofOfWork];
    for (let property in operation) {
      if (!(property in allowedProperties)) {
        throw new Error(`Unexpected property ${property} in operation.`);
      }
    }

    // Verify required properties.
    const requiredProperties = [OperationProperty.signature, OperationProperty.proofOfWork];
    for (let requiredProperty in requiredProperties) {
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
    for (let property in mutuallyExclusiveProperties) {
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

    const operationTypeAndPayload = WriteOperation.getOperationTypeAndPayload(operation);
    this.type = operationTypeAndPayload[0];

    const payload = operationTypeAndPayload[1];

    switch (this.type) {
      case OperationType.Create:
        this.didDocument = WriteOperation.parseCreatePayload(payload);
        this.did = this.didDocument.id;
        this.operationNumber = 0;
        this.perviousOperationHash = undefined;
        break;
      default:
        throw new Error(`Not implemented operation type ${this.type}.`);
    }
  }

  /**
   * Parses the given request.
   * Creates a WriteOperation if the request given follows one and only one write operation JSON schema,
   * throws error otherwise.
   */
  public static parse (request: Buffer): WriteOperation {
    return new WriteOperation(request);
  }

  /**
   * Given an operation object, returns a tuple of operation type and the the operation payload.
   */
  private static getOperationTypeAndPayload (operation: any): [OperationType, object] {
    if (operation.hasOwnProperty(OperationProperty.createPayload)) {
      return [OperationType.Create, operation.createPayload];
    } else if (operation.hasOwnProperty(OperationProperty.updatePayload)) {
      return [OperationType.Update, operation.updatePayload];
    } else if (operation.hasOwnProperty(OperationProperty.deletePayload)) {
      return [OperationType.Delete, operation.deletePayload];
    } else if (operation.hasOwnProperty(OperationProperty.recoverPayload)) {
      return [OperationType.Recover, operation.recoverPayload];
    } else {
      throw new Error('Unknown operation.');
    }
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
