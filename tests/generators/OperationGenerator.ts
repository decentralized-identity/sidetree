import AnchoredOperation from '../../lib/core/versions/latest/AnchoredOperation';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import DidServiceEndpointModel from '../../lib/core/versions/latest/models/DidServiceEndpointModel';
import Document from '../../lib/core/versions/latest/Document';
import Encoder from '../../lib/core/versions/latest/Encoder';
import Jws from '../../lib/core/versions/latest/util/Jws';
import JwsModel from '../../lib/core/versions/latest/models/JwsModel';
import OperationType from '../../lib/core/enums/OperationType';
import { PrivateKey } from '@decentralized-identity/did-auth-jose';

/**
 * A class that can generate valid operations.
 * Mainly useful for testing purposes.
 */
export default class OperationGenerator {
  /**
   * Creates an `AnchoredOperation` given the operation buffer, transaction number, transaction time, and operation index.
   */
  public static createAnchoredOperationFromOperationBuffer (
    operationBuffer: Buffer,
    transactionNumber: number,
    transactionTime: number,
    operationIndex: number): AnchoredOperation {

    const anchoredOperationModel: AnchoredOperationModel = {
      transactionNumber,
      transactionTime,
      operationIndex,
      operationBuffer
    };

    return AnchoredOperation.createAnchoredOperation(anchoredOperationModel);
  }

  /**
   * Creates an anchored operation.
   */
  public static async createAnchoredOperation (
    type: OperationType,
    payload: any,
    publicKeyId: string,
    privateKey: string | PrivateKey,
    transactionTime: number,
    transactionNumber: number,
    operationIndex: number
  ): Promise<AnchoredOperation> {
    const anchoredOperationModel =
      await OperationGenerator.createAnchoredOperationModel(type, payload, publicKeyId, privateKey, transactionTime, transactionNumber, operationIndex);
    const anchoredOperation = AnchoredOperation.createAnchoredOperation(anchoredOperationModel);

    return anchoredOperation;
  }

  /**
   * Creates an anchored operation model.
   */
  public static async createAnchoredOperationModel (
    type: OperationType,
    payload: any,
    publicKeyId: string,
    privateKey: string | PrivateKey,
    transactionTime: number,
    transactionNumber: number,
    operationIndex: number
  ): Promise<AnchoredOperationModel> {
    const operationBuffer = await OperationGenerator.createOperationBuffer(type, payload, publicKeyId, privateKey);
    const anchoredOperationModel: AnchoredOperationModel = {
      operationBuffer,
      operationIndex,
      transactionNumber,
      transactionTime
    };

    return anchoredOperationModel;
  }

  /**
   * Creates an operation.
   */
  public static async createOperationBuffer (
    type: OperationType,
    payload: any,
    publicKeyId: string,
    privateKey: string | PrivateKey
  ): Promise<Buffer> {
    const operationJws = await OperationGenerator.createOperationJws(type, payload, publicKeyId, privateKey);
    return Buffer.from(JSON.stringify(operationJws));
  }

  /**
   * Generates a create operation.
   */
  public static async generateCreateOperationBuffer (
    recoveryPublicKey: DidPublicKeyModel,
    recoveryPrivateKey: string | PrivateKey,
    signingPublicKey: DidPublicKeyModel,
    nextRecoveryOtpHash: Buffer,
    nextUpdateOtpHash: Buffer,
    serviceEndpoints?: DidServiceEndpointModel[]
  ): Promise<Buffer> {
    const publicKeys = [recoveryPublicKey, signingPublicKey];
    const payload = {
      didDocument: Document.create(publicKeys, serviceEndpoints),
      nextRecoveryOtpHash: Encoder.encode(nextRecoveryOtpHash),
      nextUpdateOtpHash: Encoder.encode(nextUpdateOtpHash)
    };

    return this.createOperationBuffer(OperationType.Create, payload, recoveryPublicKey.id, recoveryPrivateKey);
  }

  /**
   * Creates an operation.
   *
   * @param payload Unencoded plain object to be stringified and encoded as payload string.
   */
  public static async createOperationJws (
    type: OperationType,
    payload: any,
    publicKeyId: string,
    privateKey: string | PrivateKey
  ): Promise<JwsModel> {

    // Create the encoded protected header.
    const protectedHeader = {
      operation: type,
      kid: publicKeyId,
      alg: 'ES256K'
    };
    const protectedHeaderJsonString = JSON.stringify(protectedHeader);
    const protectedHeaderEncodedString = Encoder.encode(protectedHeaderJsonString);

    // Create the create payload.
    const payloadJsonString = JSON.stringify(payload);
    const createPayload = Encoder.encode(payloadJsonString);

    // Generate the signature.
    const signature = await Jws.sign(protectedHeaderEncodedString, createPayload, privateKey);

    const operation = {
      protected: protectedHeaderEncodedString,
      payload: createPayload,
      signature
    };

    return operation;
  }

  /**
   * Generates an Update Operation buffer with valid signature.
   */
  public static async generateUpdateOperationBuffer (updatePayload: object, keyId: string, privateKey: string | PrivateKey): Promise<Buffer> {
    const operation = await OperationGenerator.generateUpdateOperation(updatePayload, keyId, privateKey);
    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Creates an update operation for adding a key.
   */
  public static createUpdatePayloadForAddingAKey (previousOperation: AnchoredOperation, keyId: string, publicKeyHex: string): any {
    const updatePayload = {
      didUniqueSuffix: previousOperation.didUniqueSuffix,
      patches: [
        {
          action: 'add-public-keys',
          publicKeys: [
            {
              id: keyId,
              type: 'Secp256k1VerificationKey2018',
              usage: 'signing',
              publicKeyHex: publicKeyHex
            }
          ]
        }
      ]
    };

    return updatePayload;
  }

  /**
   * Creates an update operation for adding and/or removing hub service endpoints.
   */
  public static createUpdatePayloadForHubEndpoints (didUniqueSuffix: string, endpointsToAdd: string[], endpointsToRemove: string[]): any {
    const patches = [];

    if (endpointsToAdd.length > 0) {
      const patch = {
        action: 'add-service-endpoints',
        serviceType: 'IdentityHub',
        serviceEndpoints: endpointsToAdd
      };

      patches.push(patch);
    }

    if (endpointsToRemove.length > 0) {
      const patch = {
        action: 'remove-service-endpoints',
        serviceType: 'IdentityHub',
        serviceEndpoints: endpointsToRemove
      };

      patches.push(patch);
    }

    const updatePayload = {
      didUniqueSuffix,
      patches
    };

    return updatePayload;
  }

  /**
   * Generates an Update Operation buffer with valid signature.
   */
  public static async generateUpdateOperation (updatePayload: object, signingKeyId: string, privateKey: string | PrivateKey): Promise<JwsModel> {
    const operationJws = await OperationGenerator.createOperationJws(OperationType.Update, updatePayload, signingKeyId, privateKey);
    return operationJws;
  }

  /**
   * Generates a Delete Operation buffer.
   */
  public static async generateDeleteOperationBuffer (didUniqueSuffix: string, signingKeyId: string, privateKey: string | PrivateKey): Promise<Buffer> {
    const operation = await OperationGenerator.generateDeleteOperation(didUniqueSuffix, signingKeyId, privateKey);
    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Generates a Delete Operation.
   */
  public static async generateDeleteOperation (didUniqueSuffix: string, signingKeyId: string, privateKey: string | PrivateKey): Promise<JwsModel> {
    const operationJws = await OperationGenerator.createOperationJws(OperationType.Delete, { didUniqueSuffix }, signingKeyId, privateKey);
    return operationJws;
  }

  /**
   * Generates a Recover Operation buffer with valid signature.
   */
  public static async generateRecoverOperationBuffer (
    didUniqueSuffix: string,
    newDidDocumentTemplate: any,
    existingRecoveryKeyId: string,
    existingRecoveryPrivateKey: string | PrivateKey,
    newRecoveryKey: DidPublicKeyModel
  ): Promise<Buffer> {
    // Replace the placeholder public-key with the public-key given.
    newDidDocumentTemplate.publicKey[0] = newRecoveryKey;

    // Construct and encode the payload.
    const payload = {
      didUniqueSuffix,
      newDidDocument: newDidDocumentTemplate
    };

    const operationJws = await OperationGenerator.createOperationJws(OperationType.Recover, payload, existingRecoveryKeyId, existingRecoveryPrivateKey);
    return Buffer.from(JSON.stringify(operationJws));
  }

  /**
   * Generates a single element array with a identity hub service object for DID document
   * @param instances the instance field in serviceEndpoint. A list of DIDs
   */
  public static createIdentityHubUserServiceEndpoints (instances: string[]): any[] {
    return [
      {
        'id': 'IdentityHub',
        'type': 'IdentityHub',
        'serviceEndpoint': {
          '@context': 'schema.identity.foundation/hub',
          '@type': 'UserServiceEndpoint',
          'instances': instances
        }
      }
    ];
  }
}
