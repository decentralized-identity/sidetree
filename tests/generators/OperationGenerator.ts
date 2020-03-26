import * as crypto from 'crypto';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import DidServiceEndpointModel from '../../lib/core/versions/latest/models/DidServiceEndpointModel';
import Encoder from '../../lib/core/versions/latest/Encoder';
import Jws from '../../lib/core/versions/latest/util/Jws';
import JwsModel from '../../lib/core/versions/latest/models/JwsModel';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationModel from '../../lib/core/versions/latest/models/OperationModel';
import OperationType from '../../lib/core/enums/OperationType';
import PublicKeyModel from '../../lib/core/models/PublicKeyModel';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';

interface AnchoredCreateOperationGenerationInput {
  transactionNumber: number;
  transactionTime: number;
  operationIndex: number;
}

interface GeneratedAnchoredCreateOperationData {
  createOperation: CreateOperation;
  anchoredOperationModel: AnchoredOperationModel;
  recoveryKeyId: string;
  recoveryPublicKey: DidPublicKeyModel;
  recoveryPrivateKey: string;
  signingKeyId: string;
  signingPublicKey: DidPublicKeyModel;
  signingPrivateKey: string;
  nextRecoveryRevealValueEncodedString: string;
  nextUpdateRevealValueEncodedString: string;
}

interface RecoverOperationGenerationInput {
  didUniqueSuffix: string;
  recoveryRevealValue: string;
  recoveryPrivateKey: string;
}

interface GeneratedRecoverOperationData {
  operationBuffer: Buffer;
  recoverOperation: RecoverOperation;
  recoveryKeyId: string;
  recoveryPublicKey: DidPublicKeyModel;
  recoveryPrivateKey: string;
  signingKeyId: string;
  signingPublicKey: DidPublicKeyModel;
  signingPrivateKey: string;
  nextRecoveryRevealValueEncodedString: string;
  nextUpdateRevealValueEncodedString: string;
}

/**
 * A class that can generate valid operations.
 * Mainly useful for testing purposes.
 */
export default class OperationGenerator {

  /**
   * Generates random hash.
   */
  public static generateRandomHash (): string {
    const randomBuffer = crypto.randomBytes(32);
    const randomHash = Encoder.encode(Multihash.hash(randomBuffer));

    return randomHash;
  }

  /**
   * Generates a reveal value and commitment hash as encoded strings for use in opertaions.
   * @returns [revealValueEncodedString, commitmentValueHashEncodedString]
   */
  public static generateCommitRevealPair (): [string, string] {
    const revealValueBuffer = crypto.randomBytes(32);
    const revealValueEncodedString = Encoder.encode(revealValueBuffer);
    const commitmentHash = Multihash.hash(revealValueBuffer, 18); // 18 = SHA256;
    const commitmentHashEncodedString = Encoder.encode(commitmentHash);

    return [revealValueEncodedString, commitmentHashEncodedString];
  }

  /**
   * Generates an anchored create operation.
   */
  public static async generateAnchoredCreateOperation (input: AnchoredCreateOperationGenerationInput): Promise<GeneratedAnchoredCreateOperationData> {
    const createOperationData = await OperationGenerator.generateCreateOperation();

    const anchoredOperationModel = {
      type: OperationType.Create,
      didUniqueSuffix: createOperationData.createOperation.didUniqueSuffix,
      operationBuffer: createOperationData.createOperation.operationBuffer,
      transactionNumber: input.transactionNumber,
      transactionTime: input.transactionTime,
      operationIndex: input.operationIndex
    };

    return {
      createOperation: createOperationData.createOperation,
      anchoredOperationModel,
      recoveryKeyId: createOperationData.recoveryKeyId,
      recoveryPublicKey: createOperationData.recoveryPublicKey,
      recoveryPrivateKey: createOperationData.recoveryPrivateKey,
      signingKeyId: createOperationData.signingKeyId,
      signingPublicKey: createOperationData.signingPublicKey,
      signingPrivateKey: createOperationData.signingPrivateKey,
      nextRecoveryRevealValueEncodedString: createOperationData.nextRecoveryRevealValueEncodedString,
      nextUpdateRevealValueEncodedString: createOperationData.nextUpdateRevealValueEncodedString
    };
  }

  /**
   * Generates an create operation.
   */
  public static async generateCreateOperation () {
    const recoveryKeyId = '#recoveryKey';
    const signingKeyId = '#signingKey';
    const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex(recoveryKeyId);
    const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId);
    const hubServiceEndpoint = 'did:sidetree:value0';
    const service = OperationGenerator.createIdentityHubUserServiceEndpoints([hubServiceEndpoint]);

    // Generate the next update and recover operation commitment hash reveal value pair.
    const [nextRecoveryRevealValueEncodedString, nextRecoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
    const [nextUpdateRevealValueEncodedString, nextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();

    const operationRequest = await OperationGenerator.generateCreateOperationRequest(
      recoveryPublicKey,
      signingPublicKey,
      nextRecoveryCommitmentHash,
      nextUpdateCommitmentHash,
      service
    );

    const operationBuffer = Buffer.from(JSON.stringify(operationRequest));

    const createOperation = await CreateOperation.parse(operationBuffer);

    return {
      createOperation,
      operationRequest,
      recoveryKeyId,
      recoveryPublicKey,
      recoveryPrivateKey,
      signingKeyId,
      signingPublicKey,
      signingPrivateKey,
      nextRecoveryRevealValueEncodedString,
      nextUpdateRevealValueEncodedString
    };
  }

  /**
   * Generates a recover operation payload.
   */
  public static async generateRecoverOperation (input: RecoverOperationGenerationInput): Promise<GeneratedRecoverOperationData> {
    const recoveryKeyId = '#newRecoveryKey';
    const signingKeyId = '#newSigningKey';
    const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex(recoveryKeyId);
    const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId);
    const hubServiceEndpoint = 'did:sidetree:value0';
    const services = OperationGenerator.createIdentityHubUserServiceEndpoints([hubServiceEndpoint]);

    // Generate the next update and recover operation commitment hash reveal value pair.
    const [nextRecoveryRevealValueEncodedString, nextRecoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
    const [nextUpdateRevealValueEncodedString, nextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();

    const operationJson = await OperationGenerator.generateRecoverOperationRequest(
      input.didUniqueSuffix,
      input.recoveryRevealValue,
      input.recoveryPrivateKey,
      recoveryPublicKey,
      signingPublicKey,
      nextRecoveryCommitmentHash,
      nextUpdateCommitmentHash,
      services
    );

    const operationBuffer = Buffer.from(JSON.stringify(operationJson));
    const recoverOperation = await RecoverOperation.parse(operationBuffer);

    return {
      recoverOperation,
      operationBuffer,
      recoveryKeyId,
      recoveryPublicKey,
      recoveryPrivateKey,
      signingKeyId,
      signingPublicKey,
      signingPrivateKey,
      nextRecoveryRevealValueEncodedString,
      nextUpdateRevealValueEncodedString
    };
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
  public static createAnchoredOperationModelFromOperationModel (
    operationModel: OperationModel,
    transactionTime: number,
    transactionNumber: number,
    operationIndex: number
  ): AnchoredOperationModel {
    const anchoredOperationModel: AnchoredOperationModel = {
      didUniqueSuffix: operationModel.didUniqueSuffix,
      type: operationModel.type,
      operationBuffer: operationModel.operationBuffer,
      operationIndex,
      transactionNumber,
      transactionTime
    };
    return anchoredOperationModel;
  }

  /**
   * Generates a create operation request.
   * @param nextRecoveryCommitmentHash The encoded commitment hash for the next recovery.
   * @param nextUpdateCommitmentHash The encoded commitment hash for the next update.
   */
  public static async generateCreateOperationRequest (
    recoveryPublicKey: PublicKeyModel,
    signingPublicKey: DidPublicKeyModel,
    nextRecoveryCommitmentHash: string,
    nextUpdateCommitmentHash: string,
    serviceEndpoints?: DidServiceEndpointModel[]) {
    const document = {
      publicKeys: [signingPublicKey],
      service: serviceEndpoints
    };

    const patches = [{
      action: 'replace',
      document
    }];

    const operationData = {
      nextUpdateCommitmentHash,
      patches
    };

    const operationDataBuffer = Buffer.from(JSON.stringify(operationData));
    const operationDataHash = Encoder.encode(Multihash.hash(operationDataBuffer));

    const suffixData = {
      operationDataHash,
      recoveryKey: { publicKeyHex: recoveryPublicKey.publicKeyHex },
      nextRecoveryCommitmentHash
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
  public static async generateUpdateOperationRequest (didUniqueSuffix?: string) {
    if (didUniqueSuffix === undefined) {
      didUniqueSuffix = OperationGenerator.generateRandomHash();
    }

    const [updateRevealValue] = OperationGenerator.generateCommitRevealPair();
    const [, nextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
    const anyNewSigningPublicKeyId = '#anyNewKey';
    const [anyNewSigningKey] = await Cryptography.generateKeyPairHex(anyNewSigningPublicKeyId);
    const patches = [
      {
        action: 'add-public-keys',
        publicKeys: [
          {
            id: anyNewSigningPublicKeyId,
            type: 'Secp256k1VerificationKey2018',
            publicKeyHex: anyNewSigningKey.publicKeyHex
          }
        ]
      }
    ];
    const signingKeyId = '#anySigningKeyId';
    const [, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId);
    const request = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      updateRevealValue,
      nextUpdateCommitmentHash,
      patches,
      signingKeyId,
      signingPrivateKey
    );

    const buffer = Buffer.from(JSON.stringify(request));
    const updateOperation = await UpdateOperation.parse(buffer);

    return {
      request,
      buffer,
      updateOperation
    };
  }

  /**
   * Creates an update operation request.
   */
  public static async createUpdateOperationRequest (
    didUniqueSuffix: string,
    updateRevealValue: string,
    nextUpdateCommitmentHash: string,
    patches: any,
    signingKeyId: string,
    signingPrivateKey: string
  ) {
    const operationData = {
      patches,
      nextUpdateCommitmentHash
    };
    const operationDataJsonString = JSON.stringify(operationData);
    const encodedOperationDataString = Encoder.encode(operationDataJsonString);

    const operationDataHash = Multihash.hash(Buffer.from(operationDataJsonString));
    const encodedOperationDataHash = Encoder.encode(operationDataHash);
    const signedOperationDataHash = await OperationGenerator.signUsingEs256k(encodedOperationDataHash, signingKeyId, signingPrivateKey);

    const updateOperationRequest = {
      type: OperationType.Update,
      didUniqueSuffix,
      updateRevealValue,
      operationData: encodedOperationDataString,
      signedOperationDataHash
    };

    return updateOperationRequest;
  }

  /**
   * Generates a recover operation request.
   */
  public static async generateRecoverOperationRequest (
    didUniqueSuffix: string,
    recoveryRevealValue: string,
    recoveryPrivateKey: string,
    newRecoveryPublicKey: PublicKeyModel,
    newSigningPublicKey: DidPublicKeyModel,
    nextRecoveryCommitmentHash: string,
    nextUpdateCommitmentHash: string,
    serviceEndpoints?: DidServiceEndpointModel[]) {
    const document = {
      publicKeys: [newSigningPublicKey],
      service: serviceEndpoints
    };
    const recoverOperation = await OperationGenerator.createRecoverOperationRequest(
      didUniqueSuffix, recoveryRevealValue, recoveryPrivateKey, newRecoveryPublicKey, nextRecoveryCommitmentHash, nextUpdateCommitmentHash, document
    );
    return recoverOperation;
  }

  /**
   * Creates a recover operation request.
   */
  public static async createRecoverOperationRequest (
    didUniqueSuffix: string,
    recoveryRevealValue: string,
    recoveryPrivateKey: string,
    newRecoveryPublicKey: PublicKeyModel,
    nextRecoveryCommitmentHash: string,
    nextUpdateCommitmentHash: string,
    document: any) {

    const patches = [{
      action: 'replace',
      document
    }];

    const operationData = {
      patches,
      nextUpdateCommitmentHash
    };

    const operationDataBuffer = Buffer.from(JSON.stringify(operationData));
    const operationDataHash = Encoder.encode(Multihash.hash(operationDataBuffer));

    const signedOperationDataPayloadObject = {
      operationDataHash,
      recoveryKey: { publicKeyHex: newRecoveryPublicKey.publicKeyHex },
      nextRecoveryCommitmentHash
    };
    const signedOperationDataPayloadEncodedString = Encoder.encode(JSON.stringify(signedOperationDataPayloadObject));
    const signedOperationData = await OperationGenerator.signUsingEs256k(signedOperationDataPayloadEncodedString, '#recovery', recoveryPrivateKey);

    const operationDataEncodedString = Encoder.encode(operationDataBuffer);
    const operation = {
      type: OperationType.Recover,
      didUniqueSuffix,
      recoveryRevealValue,
      signedOperationData,
      operationData: operationDataEncodedString
    };

    return operation;
  }

  /**
   * Generates a revoke operation request.
   */
  public static async generateRevokeOperationRequest (
    didUniqueSuffix: string,
    recoveryRevealValue: string,
    recoveryPrivateKey: string) {

    const signedOperationDataPayloadObject = {
      didUniqueSuffix,
      recoveryRevealValue
    };
    const signedOperationDataPayloadEncodedString = Encoder.encode(JSON.stringify(signedOperationDataPayloadObject));
    const signedOperationData = await OperationGenerator.signUsingEs256k(signedOperationDataPayloadEncodedString, '#recovery', recoveryPrivateKey);

    const operation = {
      type: OperationType.Revoke,
      didUniqueSuffix,
      recoveryRevealValue,
      signedOperationData
    };

    return operation;
  }

  /**
   * Generates a create operation request buffer.
   * @param nextRecoveryCommitmentHash The encoded commitment hash for the next recovery.
   * @param nextUpdateCommitmentHash The encoded commitment hash for the next update.
   */
  public static async generateCreateOperationBuffer (
    recoveryPublicKey: PublicKeyModel,
    signingPublicKey: DidPublicKeyModel,
    nextRecoveryCommitmentHash: string,
    nextUpdateCommitmentHash: string,
    serviceEndpoints?: DidServiceEndpointModel[]
  ): Promise<Buffer> {
    const operation = await OperationGenerator.generateCreateOperationRequest(
      recoveryPublicKey,
      signingPublicKey,
      nextRecoveryCommitmentHash,
      nextUpdateCommitmentHash,
      serviceEndpoints
    );

    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Creates an update operation for adding a key.
   */
  public static async createUpdateOperationRequestForAddingAKey (
    didUniqueSuffix: string,
    updateRevealValue: string,
    idOfNewKey: string,
    newPublicKeyHex: string,
    nextUpdateCommitmentHash: string,
    signingKeyId: string,
    signingPrivateKey: string) {

    const patches = [
      {
        action: 'add-public-keys',
        publicKeys: [
          {
            id: idOfNewKey,
            type: 'Secp256k1VerificationKey2018',
            publicKeyHex: newPublicKeyHex
          }
        ]
      }
    ];

    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      updateRevealValue,
      nextUpdateCommitmentHash,
      patches,
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
    updateRevealValue: string,
    nextUpdateCommitmentHash: string,
    endpointsToAdd: string[],
    endpointsToRemove: string[],
    signingKeyId: string,
    signingPrivateKey: string) {
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

    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      updateRevealValue,
      nextUpdateCommitmentHash,
      patches,
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
   * Generates a Revoke Operation buffer.
   */
  public static async generateRevokeOperationBuffer (
    didUniqueSuffix: string,
    recoveryRevealValueEncodedSring: string,
    privateKey: string): Promise<Buffer> {
    const operation = await OperationGenerator.generateRevokeOperationRequest(didUniqueSuffix, recoveryRevealValueEncodedSring, privateKey);
    return Buffer.from(JSON.stringify(operation));
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
