import * as crypto from 'crypto';
import AnchoredOperation from '../../lib/core/versions/latest/AnchoredOperation';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import DidServiceEndpointModel from '../../lib/core/versions/latest/models/DidServiceEndpointModel';
import Document from '../../lib/core/versions/latest/Document';
import Encoder from '../../lib/core/versions/latest/Encoder';
import Jws from '../../lib/core/versions/latest/util/Jws';
import JwsModel from '../../lib/core/versions/latest/models/JwsModel';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import Multihash from '../../lib/core/versions/latest/Multihash';
import NamedAnchoredOperationModel from '../../lib/core/models/NamedAnchoredOperationModel';
import OperationModel from '../../lib/core/versions/latest/models/OperationModel';
import OperationType from '../../lib/core/enums/OperationType';
import PublicKeyModel from '../../lib/core/versions/latest/models/PublicKeyModel';

interface AnchoredCreateOperationGenerationInput {
  transactionNumber: number;
  transactionTime: number;
  operationIndex: number;
}

interface GeneratedAnchoredCreateOperationData {
  createOperation: CreateOperation;
  namedAnchoredOperationModel: NamedAnchoredOperationModel;
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

interface RecoveryOperationPayloadGenerationInput {
  didUniqueSuffix: string;
  recoveryOtp: string;
}

interface GeneratedRecoveryOperationPayloadData {
  payload: any;
  recoveryKeyId: string;
  recoveryPublicKey: DidPublicKeyModel;
  recoveryPrivateKey: string;
  signingKeyId: string;
  signingPublicKey: DidPublicKeyModel;
  signingPrivateKey: string;
  nextRecoveryOtpEncodedString: string;
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
    const createOperationData = await OperationGenerator.generateCreateOperation();

    const namedAnchoredOperationModel = {
      type: OperationType.Create,
      didUniqueSuffix: createOperationData.createOperation.didUniqueSuffix,
      operationBuffer: createOperationData.createOperation.operationBuffer,
      transactionNumber: input.transactionNumber,
      transactionTime: input.transactionTime,
      operationIndex: input.operationIndex
    };

    return {
      createOperation: createOperationData.createOperation,
      namedAnchoredOperationModel,
      recoveryKeyId: createOperationData.recoveryKeyId,
      recoveryPublicKey: createOperationData.recoveryPublicKey,
      recoveryPrivateKey: createOperationData.recoveryPrivateKey,
      signingKeyId: createOperationData.signingKeyId,
      signingPublicKey: createOperationData.signingPublicKey,
      signingPrivateKey: createOperationData.signingPrivateKey,
      nextRecoveryOtpEncodedString: createOperationData.nextRecoveryOtpEncodedString,
      nextUpdateOtpEncodedString: createOperationData.nextUpdateOtpEncodedString
    };
  }

  /**
   * Generates an create operation.
   */
  public static async generateCreateOperation () {
    const recoveryKeyId = '#recoveryKey';
    const signingKeyId = '#signingKey';
    const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex(recoveryKeyId, KeyUsage.recovery);
    const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId, KeyUsage.signing);
    const hubServiceEndpoint = 'did:sidetree:value0';
    const service = OperationGenerator.createIdentityHubUserServiceEndpoints([hubServiceEndpoint]);

    // Generate the next update and recovery operation OTP.
    const [nextRecoveryOtpEncodedString, nextRecoveryOtpHash] = OperationGenerator.generateOtp();
    const [nextUpdateOtpEncodedString, nextUpdateOtpHash] = OperationGenerator.generateOtp();

    const operationBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      signingPublicKey,
      nextRecoveryOtpHash,
      nextUpdateOtpHash,
      service
    );

    const createOperation = await CreateOperation.parse(operationBuffer);

    return {
      createOperation,
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
      type: OperationType.Update,
      didUniqueSuffix: input.didUniqueSuffix,
      patches: input.patches,
      updateOtp: updateOtpEncodedString,
      nextUpdateOtpHash
    };

    const anchoredOperation = await OperationGenerator.createAnchoredOperation(
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
   * Generates a recover operation payload.
   */
  public static async generateRecoveryOperationPayload (input: RecoveryOperationPayloadGenerationInput): Promise<GeneratedRecoveryOperationPayloadData> {
    const recoveryKeyId = '#newRecoveryKey';
    const signingKeyId = '#newSigningKey';
    const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex(recoveryKeyId, KeyUsage.recovery);
    const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId, KeyUsage.signing);
    const hubServiceEndpoint = 'did:sidetree:value0';
    const services = OperationGenerator.createIdentityHubUserServiceEndpoints([hubServiceEndpoint]);
    const newDidDocument = Document.create([recoveryPublicKey, signingPublicKey], services);

    // Generate the next update and recovery operation OTP.
    const [nextRecoveryOtpEncodedString, nextRecoveryOtpHash] = OperationGenerator.generateOtp();
    const [nextUpdateOtpEncodedString, nextUpdateOtpHash] = OperationGenerator.generateOtp();

    const payload = {
      type: OperationType.Recover,
      didUniqueSuffix: input.didUniqueSuffix,
      recoveryOtp: input.recoveryOtp,
      newDidDocument,
      nextRecoveryOtpHash,
      nextUpdateOtpHash
    };

    return {
      payload,
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
   * Creates an anchored operation.
   */
  public static async createAnchoredOperation (
    payload: any,
    publicKeyId: string,
    privateKey: string,
    transactionTime: number,
    transactionNumber: number,
    operationIndex: number
  ): Promise<AnchoredOperation> {
    const anchoredOperationModel =
      await OperationGenerator.createAnchoredOperationModel(payload, publicKeyId, privateKey, transactionTime, transactionNumber, operationIndex);
    const anchoredOperation = AnchoredOperation.createAnchoredOperation(anchoredOperationModel);

    return anchoredOperation;
  }

  /**
   * Creates an anchored operation model.
   */
  public static async createAnchoredOperationModel (
    payload: any,
    publicKeyId: string,
    privateKey: string,
    transactionTime: number,
    transactionNumber: number,
    operationIndex: number
  ): Promise<AnchoredOperationModel> {
    const operationBuffer = await OperationGenerator.createOperationBuffer(payload, publicKeyId, privateKey);
    const anchoredOperationModel: AnchoredOperationModel = {
      operationBuffer,
      operationIndex,
      transactionNumber,
      transactionTime
    };

    return anchoredOperationModel;
  }

  /**
   * Creates a named anchored operation model.
   */
  public static async createNamedAnchoredOperationModel (
    didUniqueSuffix: string,
    type: OperationType,
    payload: any,
    publicKeyId: string,
    privateKey: string,
    transactionTime: number,
    transactionNumber: number,
    operationIndex: number
  ): Promise<NamedAnchoredOperationModel> {
    const operationBuffer = await OperationGenerator.createOperationBuffer(payload, publicKeyId, privateKey);
    const namedAnchoredOperationModel: NamedAnchoredOperationModel = {
      didUniqueSuffix,
      type,
      operationBuffer,
      operationIndex,
      transactionNumber,
      transactionTime
    };

    return namedAnchoredOperationModel;
  }

  /**
   * Creates an operation.
   */
  public static async createOperationBuffer (
    payload: any,
    publicKeyId: string,
    privateKey: string
  ): Promise<Buffer> {
    const protectedHeader = {
      kid: publicKeyId,
      alg: 'ES256K'
    };

    const operationJws = await Jws.sign(protectedHeader, payload, privateKey);
    return Buffer.from(JSON.stringify(operationJws));
  }

  /**
   * Creates a named anchored operation model from `OperationModel`.
   */
  public static createNamedAnchoredOperationModelFromOperationModel (
    operationModel: OperationModel,
    transactionTime: number,
    transactionNumber: number,
    operationIndex: number
  ): NamedAnchoredOperationModel {
    const namedAnchoredOperationModel: NamedAnchoredOperationModel = {
      didUniqueSuffix: operationModel.didUniqueSuffix,
      type: operationModel.type,
      operationBuffer: operationModel.operationBuffer,
      operationIndex,
      transactionNumber,
      transactionTime
    };
    return namedAnchoredOperationModel;
  }

  /**
   * Generates a create operation request.
   * @param nextRecoveryOtpHash The encoded hash of the OTP for the next recovery.
   * @param nextUpdateOtpHash The encoded hash of the OTP for the next update.
   */
  public static async generateCreateOperationRequest (
    recoveryPublicKey: PublicKeyModel,
    signingPublicKey: DidPublicKeyModel,
    nextRecoveryOtpHash: string,
    nextUpdateOtpHash: string,
    serviceEndpoints?: DidServiceEndpointModel[]) {
    const document = Document.create([signingPublicKey], serviceEndpoints);

    const operationData = {
      nextUpdateOtpHash,
      document
    };
    const operationDataBuffer = Buffer.from(JSON.stringify(operationData));
    const operationDataHash = Encoder.encode(Multihash.hash(operationDataBuffer));

    const suffixData = {
      operationDataHash,
      recoveryKey: { publicKeyHex: recoveryPublicKey.publicKeyHex },
      nextRecoveryOtpHash
    };

    const suffixDataEncodedString = Encoder.encode(JSON.stringify(suffixData));
    const operationDataEncodedString = Encoder.encode(operationDataBuffer);
    const operation = {
      type: OperationType.Create,
      suffixData: suffixDataEncodedString,
      operationData: operationDataEncodedString
    };

    return operation;
  }

  /**
   * Generates an update operation request.
   */
  public static async generateUpdateOperationRequest (
    didUniqueSuffix: string,
    updateOtp: string,
    nextUpdateOtpHash: string,
    documentPatch: any,
    signingKeyId: string,
    signingPrivateKey: string
  ) {
    const operationData = {
      documentPatch,
      nextUpdateOtpHash
    };
    const operationDataJsonString = JSON.stringify(operationData);
    const encodedOperationDataString = Encoder.encode(operationDataJsonString);

    const operationDataHash = Multihash.hash(Buffer.from(operationDataJsonString));
    const encodedOperationDataHash = Encoder.encode(operationDataHash);
    const signedOperationDataHash = await OperationGenerator.signUsingEs256k(encodedOperationDataHash, signingKeyId, signingPrivateKey);

    const updateOperationRequest = {
      type: OperationType.Update,
      didUniqueSuffix,
      updateOtp,
      operationData: encodedOperationDataString,
      signedOperationDataHash
    };

    return updateOperationRequest;
  }

  /**
   * Generates a create operation request buffer.
   * @param nextRecoveryOtpHash The encoded hash of the OTP for the next recovery.
   * @param nextUpdateOtpHash The encoded hash of the OTP for the next update.
   */
  public static async generateCreateOperationBuffer (
    recoveryPublicKey: PublicKeyModel,
    signingPublicKey: DidPublicKeyModel,
    nextRecoveryOtpHash: string,
    nextUpdateOtpHash: string,
    serviceEndpoints?: DidServiceEndpointModel[]
  ): Promise<Buffer> {
    const operation = await OperationGenerator.generateCreateOperationRequest(
      recoveryPublicKey,
      signingPublicKey,
      nextRecoveryOtpHash,
      nextUpdateOtpHash,
      serviceEndpoints
    );

    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Generates an Update Operation buffer with valid signature.
   */
  public static async generateUpdateOperationBuffer (updatePayload: object, keyId: string, privateKey: string): Promise<Buffer> {
    const operation = await OperationGenerator.signUsingEs256k(updatePayload, keyId, privateKey);
    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Creates an update operation for adding a key.
   */
  public static async createUpdateOperationRequestForAddingAKey (
    didUniqueSuffix: string,
    updateOtp: string,
    idOfNewKey: string,
    newPublicKeyHex: string,
    nextUpdateOtpHash: string,
    signingKeyId: string,
    signingPrivateKey: string) {

    const documentPatch = [
      {
        action: 'add-public-keys',
        publicKeys: [
          {
            id: idOfNewKey,
            type: 'Secp256k1VerificationKey2018',
            usage: 'signing',
            publicKeyHex: newPublicKeyHex
          }
        ]
      }
    ];

    const updateOperationRequest = await OperationGenerator.generateUpdateOperationRequest(
      didUniqueSuffix,
      updateOtp,
      nextUpdateOtpHash,
      documentPatch,
      signingKeyId,
      signingPrivateKey
    );

    return updateOperationRequest;
  }

  /**
   * Creates an update operation for adding and/or removing hub service endpoints.
   */
  public static async createUpdateOperationRequestForHubEndpoints (
    didUniqueSuffix: string,
    updateOtp: string,
    nextUpdateOtpHash: string,
    endpointsToAdd: string[],
    endpointsToRemove: string[],
    signingKeyId: string,
    signingPrivateKey: string) {
    const documentPatch = [];

    if (endpointsToAdd.length > 0) {
      const patch = {
        action: 'add-service-endpoints',
        serviceType: 'IdentityHub',
        serviceEndpoints: endpointsToAdd
      };

      documentPatch.push(patch);
    }

    if (endpointsToRemove.length > 0) {
      const patch = {
        action: 'remove-service-endpoints',
        serviceType: 'IdentityHub',
        serviceEndpoints: endpointsToRemove
      };

      documentPatch.push(patch);
    }

    const updateOperationRequest = await OperationGenerator.generateUpdateOperationRequest(
      didUniqueSuffix,
      updateOtp,
      nextUpdateOtpHash,
      documentPatch,
      signingKeyId,
      signingPrivateKey
    );

    return updateOperationRequest;
  }

  /**
   * Signs the given payload as a ES256K JWS.
   */
  public static async signUsingEs256k (payload: any, signingKeyId: string, privateKey: string): Promise<JwsModel> {
    const protectedHeader = {
      kid: signingKeyId,
      alg: 'ES256K'
    };

    const operationJws = await Jws.sign(protectedHeader, payload, privateKey);
    return operationJws;
  }

  /**
   * Generates a Delete Operation buffer.
   */
  public static async generateDeleteOperationBuffer (
    didUniqueSuffix: string,
    recoveryOtpEncodedSring: string,
    signingKeyId: string,
    privateKey: string): Promise<Buffer> {
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
    privateKey: string): Promise<JwsModel> {

    const protectedHeader = {
      kid: signingKeyId,
      alg: 'ES256K'
    };

    const payload = {
      type: OperationType.Delete,
      didUniqueSuffix,
      recoveryOtp: recoveryOtpEncodedSring
    };

    const operationJws = await Jws.sign(protectedHeader, payload, privateKey);
    return operationJws;
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
