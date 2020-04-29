import * as crypto from 'crypto';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Encoder from '../../lib/core/versions/latest/Encoder';
import JwkEs256k from '../../lib/core/models/JwkEs256k';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Jws from '../../lib/core/versions/latest/util/Jws';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationModel from '../../lib/core/versions/latest/models/OperationModel';
import OperationType from '../../lib/core/enums/OperationType';
import PublicKeyModel from '../../lib/core/versions/latest/models/PublicKeyModel';
import PublicKeyUsage from '../../lib/core/enums/PublicKeyUsage';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import ServiceEndpointModel from '../../lib/core/versions/latest/models/ServiceEndpointModel';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';

interface AnchoredCreateOperationGenerationInput {
  transactionNumber: number;
  transactionTime: number;
  operationIndex: number;
}

interface GeneratedAnchoredCreateOperationData {
  createOperation: CreateOperation;
  anchoredOperationModel: AnchoredOperationModel;
  recoveryPublicKey: JwkEs256k;
  recoveryPrivateKey: JwkEs256k;
  signingKeyId: string;
  signingPublicKey: PublicKeyModel;
  signingPrivateKey: JwkEs256k;
  nextRecoveryRevealValueEncodedString: string;
  nextUpdateRevealValueEncodedString: string;
}

interface RecoverOperationGenerationInput {
  didUniqueSuffix: string;
  recoveryRevealValue: string;
  recoveryPrivateKey: JwkEs256k;
}

interface GeneratedRecoverOperationData {
  operationBuffer: Buffer;
  recoverOperation: RecoverOperation;
  recoveryPublicKey: JwkEs256k;
  recoveryPrivateKey: JwkEs256k;
  signingKeyId: string;
  signingPublicKey: PublicKeyModel;
  signingPrivateKey: JwkEs256k;
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
   * Generates SECP256K1 key pair to be used in an operation. If usage not supplied, all usages will be included
   * Mainly used for testing.
   * @returns [publicKey, privateKey]
   */
  public static async generateKeyPair (id: string, usage?: string[]): Promise<[PublicKeyModel, JwkEs256k]> {
    const [publicKey, privateKey] = await Jwk.generateEs256kKeyPair();
    const publicKeyModel = {
      id,
      type: 'EcdsaSecp256k1VerificationKey2019',
      jwk: publicKey,
      usage: usage || Object.values(PublicKeyUsage)
    };

    return [publicKeyModel, privateKey];
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
    const signingKeyId = 'signingKey';
    const [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
    const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair(signingKeyId);
    const service = OperationGenerator.generateServiceEndpoints(['serviceEndpointId123']);

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
    const signingKeyId = 'newSigningKey';
    const [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
    const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair(signingKeyId);
    const services = OperationGenerator.generateServiceEndpoints(['serviceEndpointId123']);

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
   * @param nextRecoveryCommitment The encoded commitment hash for the next recovery.
   * @param nextUpdateCommitment The encoded commitment hash for the next update.
   */
  public static async generateCreateOperationRequest (
    recoveryPublicKey: JwkEs256k,
    signingPublicKey: PublicKeyModel,
    nextRecoveryCommitment: string,
    nextUpdateCommitment: string,
    serviceEndpoints?: ServiceEndpointModel[]) {
    const document = {
      publicKeys: [signingPublicKey],
      serviceEndpoints: serviceEndpoints
    };

    const patches = [{
      action: 'replace',
      document
    }];

    const delta = {
      update_commitment: nextUpdateCommitment,
      patches
    };

    const deltaBuffer = Buffer.from(JSON.stringify(delta));
    const deltaHash = Encoder.encode(Multihash.hash(deltaBuffer));

    const suffixData = {
      delta_hash: deltaHash,
      recovery_key: recoveryPublicKey,
      recovery_commitment: nextRecoveryCommitment
    };

    const suffixDataEncodedString = Encoder.encode(JSON.stringify(suffixData));
    const deltaEncodedString = Encoder.encode(deltaBuffer);
    const operation = {
      type: OperationType.Create,
      suffix_data: suffixDataEncodedString,
      delta: deltaEncodedString
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
    const anyNewSigningPublicKeyId = 'anyNewKey';
    const [anyNewSigningKey] = await OperationGenerator.generateKeyPair(anyNewSigningPublicKeyId);
    const patches = [
      {
        action: 'add-public-keys',
        publicKeys: [
          anyNewSigningKey
        ]
      }
    ];
    const signingKeyId = 'anySigningKeyId';
    const [, signingPrivateKey] = await OperationGenerator.generateKeyPair(signingKeyId);
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
    signingPrivateKey: JwkEs256k
  ) {
    const delta = {
      patches,
      update_commitment: nextUpdateCommitmentHash
    };
    const deltaJsonString = JSON.stringify(delta);
    const deltaHash = Encoder.encode(Multihash.hash(Buffer.from(deltaJsonString)));
    const encodedDeltaString = Encoder.encode(deltaJsonString);

    const signedDataPayloadObject = {
      delta_hash: deltaHash
    };
    const signedData = await OperationGenerator.signUsingEs256k(signedDataPayloadObject, signingPrivateKey, signingKeyId);

    const updateOperationRequest = {
      type: OperationType.Update,
      did_suffix: didUniqueSuffix,
      update_reveal_value: updateRevealValue,
      delta: encodedDeltaString,
      signed_data: signedData
    };

    return updateOperationRequest;
  }

  /**
   * Generates a recover operation request.
   */
  public static async generateRecoverOperationRequest (
    didUniqueSuffix: string,
    recoveryRevealValue: string,
    recoveryPrivateKey: JwkEs256k,
    newRecoveryPublicKey: JwkEs256k,
    newSigningPublicKey: PublicKeyModel,
    nextRecoveryCommitmentHash: string,
    nextUpdateCommitmentHash: string,
    serviceEndpoints?: ServiceEndpointModel[]) {
    const document = {
      publicKeys: [newSigningPublicKey],
      serviceEndpoints: serviceEndpoints
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
    recoveryPrivateKey: JwkEs256k,
    newRecoveryPublicKey: JwkEs256k,
    nextRecoveryCommitmentHash: string,
    nextUpdateCommitmentHash: string,
    document: any) {

    const patches = [{
      action: 'replace',
      document
    }];

    const delta = {
      patches,
      update_commitment: nextUpdateCommitmentHash
    };

    const deltaBuffer = Buffer.from(JSON.stringify(delta));
    const deltaHash = Encoder.encode(Multihash.hash(deltaBuffer));

    const signedDataPayloadObject = {
      delta_hash: deltaHash,
      recovery_key: newRecoveryPublicKey,
      recovery_commitment: nextRecoveryCommitmentHash
    };
    const signedData = await OperationGenerator.signUsingEs256k(signedDataPayloadObject, recoveryPrivateKey);

    const deltaEncodedString = Encoder.encode(deltaBuffer);
    const operation = {
      type: OperationType.Recover,
      did_suffix: didUniqueSuffix,
      recovery_reveal_value: recoveryRevealValue,
      signed_data: signedData,
      delta: deltaEncodedString
    };

    return operation;
  }

  /**
   * Generates a deactivate operation request.
   */
  public static async createDeactivateOperationRequest (
    didUniqueSuffix: string,
    recoveryRevealValue: string,
    recoveryPrivateKey: JwkEs256k) {

    const signedDataPayloadObject = {
      did_suffix: didUniqueSuffix,
      recovery_reveal_value: recoveryRevealValue
    };
    const signedData = await OperationGenerator.signUsingEs256k(signedDataPayloadObject, recoveryPrivateKey);

    const operation = {
      type: OperationType.Deactivate,
      did_suffix: didUniqueSuffix,
      recovery_reveal_value: recoveryRevealValue,
      signed_data: signedData
    };

    return operation;
  }

  /**
   * Generates a create operation request buffer.
   * @param nextRecoveryCommitmentHash The encoded commitment hash for the next recovery.
   * @param nextUpdateCommitmentHash The encoded commitment hash for the next update.
   */
  public static async generateCreateOperationBuffer (
    recoveryPublicKey: JwkEs256k,
    signingPublicKey: PublicKeyModel,
    nextRecoveryCommitmentHash: string,
    nextUpdateCommitmentHash: string,
    serviceEndpoints?: ServiceEndpointModel[]
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
    newPublicKey: PublicKeyModel,
    nextUpdateCommitmentHash: string,
    signingKeyId: string,
    signingPrivateKey: JwkEs256k) {

    const patches = [
      {
        action: 'add-public-keys',
        publicKeys: [
          newPublicKey
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
    idOfServiceEndpointToAdd: string | undefined,
    idsOfServiceEndpointToRemove: string[],
    signingKeyId: string,
    signingPrivateKey: JwkEs256k) {
    const patches = [];

    if (idOfServiceEndpointToAdd !== undefined) {
      const patch = {
        action: 'add-service-endpoints',
        serviceEndpoints: OperationGenerator.generateServiceEndpoints([idOfServiceEndpointToAdd])
      };

      patches.push(patch);
    }

    if (idsOfServiceEndpointToRemove.length > 0) {
      const patch = {
        action: 'remove-service-endpoints',
        serviceEndpointIds: idsOfServiceEndpointToRemove
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
   * Signs the given payload as a ES256K compact JWS.
   */
  public static async signUsingEs256k (payload: any, privateKey: JwkEs256k, signingKeyId?: string): Promise<string> {
    const protectedHeader = {
      kid: signingKeyId,
      alg: 'ES256K'
    };

    const compactJws = Jws.signAsCompactJws(payload, privateKey, protectedHeader);
    return compactJws;
  }

  /**
   * Generates a Deactivate Operation buffer.
   */
  public static async generateDeactivateOperationBuffer (
    didUniqueSuffix: string,
    recoveryRevealValueEncodedSring: string,
    privateKey: JwkEs256k): Promise<Buffer> {
    const operation = await OperationGenerator.createDeactivateOperationRequest(didUniqueSuffix, recoveryRevealValueEncodedSring, privateKey);
    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Generates an array of service endpoints with specified ids
   * @param ids the id field in serviceEndpoint.
   */
  public static generateServiceEndpoints (ids: string[]): any[] {
    const serviceEndpoints = [];
    for (const id of ids) {
      serviceEndpoints.push(
        {
          'id': id,
          'type': 'someType',
          'serviceEndpoint': 'https://www.url.com'
        }
      );
    }
    return serviceEndpoints;
  }
}
