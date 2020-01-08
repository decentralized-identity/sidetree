import * as crypto from 'crypto';
import AnchoredOperation from '../../lib/core/versions/latest/AnchoredOperation';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import DidServiceEndpointModel from '../../lib/core/versions/latest/models/DidServiceEndpointModel';
import Document from '../../lib/core/versions/latest/Document';
import Encoder from '../../lib/core/versions/latest/Encoder';
import Jws from '../../lib/core/versions/latest/util/Jws';
import JwsModel from '../../lib/core/versions/latest/models/JwsModel';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationType from '../../lib/core/enums/OperationType';
import { PrivateKey } from '@decentralized-identity/did-auth-jose';

interface AnchoredCreateOperationGenerationInput {
  transactionNumber: number;
  transactionTime: number;
  operationIndex: number;
}

interface GeneratedAnchoredCreateOperationData {
  anchoredOperation: AnchoredOperation;
  recoveryKeyId: string;
  recoveryPublicKey: DidPublicKeyModel;
  recoveryPrivateKey: string;
  signingKeyId: string;
  signingPublicKey: DidPublicKeyModel;
  signingPrivateKey: string;
  nextRecoveryOtpEncodedString: string;
  nextUpdateOtpEncodedString: string;
}

interface AnchoredUpdateOperationGenerationInput {
  transactionNumber: number;
  transactionTime: number;
  operationIndex: number;
  didUniqueSuffix: string;
  updateOtpEncodedString: string;
  patches: object[];
  signingKeyId: string;
  signingPrivateKey: string;
}

interface GeneratedAnchoredUpdateOperationData {
  anchoredOperation: AnchoredOperation;
  nextUpdateOtpEncodedString: string;
}

/**
 * A class that can generate valid operations.
 * Mainly useful for testing purposes.
 */
export default class OperationGenerator {

  /**
   * Generates an one-time password and its hash as encoded strings for use in opertaions.
   * @returns [otpEncodedString, otpHashEncodedString]
   */
  public static generateOtp (): [string, string] {
    const otpBuffer = crypto.randomBytes(32);
    const otpEncodedString = Encoder.encode(otpBuffer);
    const otpHash = Multihash.hash(otpBuffer, 18); // 18 = SHA256;
    const otpHashEncodedString = Encoder.encode(otpHash);

    return [otpEncodedString, otpHashEncodedString];
  }

  /**
   * Generates an anchored create operation.
   */
  public static async generateAnchoredCreateOperation (input: AnchoredCreateOperationGenerationInput): Promise<GeneratedAnchoredCreateOperationData> {
    const recoveryKeyId = '#key1';
    const signingKeyId = '#key2';
    const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex(recoveryKeyId, KeyUsage.recovery);
    const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId, KeyUsage.signing);
    const hubServiceEndpoint = 'did:sidetree:value0';
    const service = OperationGenerator.createIdentityHubUserServiceEndpoints([hubServiceEndpoint]);

    // Generate the next update and recovery operation OTP.
    const [nextRecoveryOtpEncodedString, nextRecoveryOtpHash] = OperationGenerator.generateOtp();
    const [nextUpdateOtpEncodedString, nextUpdateOtpHash] = OperationGenerator.generateOtp();

    const operationBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      recoveryPrivateKey,
      signingPublicKey,
      nextRecoveryOtpHash,
      nextUpdateOtpHash,
      service
    );

    const anchoredOperation = OperationGenerator.createAnchoredOperationFromOperationBuffer(
      operationBuffer,
      input.transactionNumber,
      input.transactionTime,
      input.operationIndex
    );

    return {
      anchoredOperation,
      recoveryKeyId,
      recoveryPublicKey,
      recoveryPrivateKey,
      signingKeyId,
      signingPublicKey,
      signingPrivateKey,
      nextRecoveryOtpEncodedString,
      nextUpdateOtpEncodedString
    };
  }

  /**
   * Generates an anchored update operation.
   */
  public static async generateAnchoredUpdateOperation (input: AnchoredUpdateOperationGenerationInput): Promise<GeneratedAnchoredUpdateOperationData> {
    const updateOtpEncodedString = input.updateOtpEncodedString;

    // Generate the next update OTP.
    const nextUpdateOtpBuffer = crypto.randomBytes(32);
    const nextUpdateOtpEncodedString = Encoder.encode(nextUpdateOtpBuffer);
    const nextUpdateOtpHash = Encoder.encode(Multihash.hash(nextUpdateOtpBuffer, 18)); // 18 = SHA256;

    const updatePayload = {
      didUniqueSuffix: input.didUniqueSuffix,
      patches: input.patches,
      updateOtp: updateOtpEncodedString,
      nextUpdateOtpHash
    };

    const anchoredOperation = await OperationGenerator.createAnchoredOperation(
      OperationType.Update,
      updatePayload,
      input.signingKeyId,
      input.signingPrivateKey,
      input.transactionTime,
      input.transactionNumber,
      input.operationIndex
    );

    return {
      anchoredOperation,
      nextUpdateOtpEncodedString
    };
  }

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
   * @param nextRecoveryOtpHash The encoded hash of the OTP for the next recovery.
   * @param nextUpdateOtpHash The encoded hash of the OTP for the next update.
   */
  public static async generateCreateOperationBuffer (
    recoveryPublicKey: DidPublicKeyModel,
    recoveryPrivateKey: string | PrivateKey,
    signingPublicKey: DidPublicKeyModel,
    nextRecoveryOtpHash: string,
    nextUpdateOtpHash: string,
    serviceEndpoints?: DidServiceEndpointModel[]
  ): Promise<Buffer> {
    const publicKeys = [recoveryPublicKey, signingPublicKey];
    const payload = {
      didDocument: Document.create(publicKeys, serviceEndpoints),
      nextRecoveryOtpHash,
      nextUpdateOtpHash
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
   * @param nextUpdateOtpHashEncodedString Optional OTP hash for the next update. If not given, one will be generated.
   */
  public static createUpdatePayloadForAddingAKey (
    previousOperation: AnchoredOperation,
    updateOtpEncodedString: string,
    keyId: string,
    publicKeyHex: string,
    nextUpdateOtpHashEncodedString?: string): any {
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
      ],
      updateOtp: updateOtpEncodedString,
      nextUpdateOtpHash: nextUpdateOtpHashEncodedString ? nextUpdateOtpHashEncodedString : 'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA'
    };

    return updatePayload;
  }

  /**
   * Creates an update operation for adding and/or removing hub service endpoints.
   */
  public static createUpdatePayloadForHubEndpoints (
    didUniqueSuffix: string,
    updateOtpEncodedString: string,
    endpointsToAdd: string[],
    endpointsToRemove: string[]): any {
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
      patches,
      updateOtp: updateOtpEncodedString,
      nextUpdateOtpHash: 'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA'
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
  public static async generateDeleteOperationBuffer (
    didUniqueSuffix: string,
    recoveryOtpEncodedSring: string,
    signingKeyId: string,
    privateKey: string | PrivateKey): Promise<Buffer> {
    const operation = await OperationGenerator.generateDeleteOperation(didUniqueSuffix, recoveryOtpEncodedSring, signingKeyId, privateKey);
    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Generates a Delete Operation.
   */
  public static async generateDeleteOperation (
    didUniqueSuffix: string,
    recoveryOtpEncodedSring: string,
    signingKeyId: string,
    privateKey: string | PrivateKey): Promise<JwsModel> {
    const payload = {
      didUniqueSuffix,
      recoveryOtp: recoveryOtpEncodedSring
    };
    const operationJws = await OperationGenerator.createOperationJws(OperationType.Delete, payload, signingKeyId, privateKey);
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
