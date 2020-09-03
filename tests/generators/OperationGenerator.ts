import * as crypto from 'crypto';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import DeactivateOperation from '../../lib/core/versions/latest/DeactivateOperation';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import Encoder from '../../lib/core/versions/latest/Encoder';
import JwkEs256k from '../../lib/core/models/JwkEs256k';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Jws from '../../lib/core/versions/latest/util/Jws';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationModel from '../../lib/core/versions/latest/models/OperationModel';
import OperationType from '../../lib/core/enums/OperationType';
import PublicKeyModel from '../../lib/core/versions/latest/models/PublicKeyModel';
import PublicKeyPurpose from '../../lib/core/versions/latest/PublicKeyPurpose';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import ServiceEndpointModel from '../../lib/core/versions/latest/models/ServiceEndpointModel';
import TransactionModel from '../../lib/common/models/TransactionModel';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';
import DataGenerator from './DataGenerator';

interface AnchoredCreateOperationGenerationInput {
  transactionNumber: number;
  transactionTime: number;
  operationIndex: number;
}

interface RecoverOperationGenerationInput {
  didUniqueSuffix: string;
  recoveryPrivateKey: JwkEs256k;
}

interface GeneratedRecoverOperationData {
  operationBuffer: Buffer;
  recoverOperation: RecoverOperation;
  recoveryPublicKey: JwkEs256k;
  recoveryPrivateKey: JwkEs256k;
  signingPublicKey: PublicKeyModel;
  signingPrivateKey: JwkEs256k;
  updateKey: PublicKeyModel;
  updatePrivateKey: JwkEs256k;
}

/**
 * A class that can generate valid operations.
 * Mainly useful for testing purposes.
 */
export default class OperationGenerator {

  /**
   * Generates a random `TransactionModel`.
   */
  public static generateTransactionModel (): TransactionModel {
    return {
      anchorString: OperationGenerator.generateRandomHash(),
      normalizedTransactionFee: DataGenerator.generateInteger(),
      transactionFeePaid: DataGenerator.generateInteger(),
      transactionNumber: DataGenerator.generateInteger(),
      transactionTime: DataGenerator.generateInteger(),
      transactionTimeHash: OperationGenerator.generateRandomHash(),
      writer: OperationGenerator.generateRandomHash()
    };
  }

  /**
   * Generates random hash.
   */
  public static generateRandomHash (): string {
    const randomBuffer = crypto.randomBytes(32);
    const randomHash = Encoder.encode(Multihash.hash(randomBuffer));

    return randomHash;
  }

  /**
   * Generates SECP256K1 key pair to be used in an operation. If purpose not supplied, all purposes will be included
   * Mainly used for testing.
   * @returns [publicKey, privateKey]
   */
  public static async generateKeyPair (id: string, purpose?: PublicKeyPurpose[]): Promise<[PublicKeyModel, JwkEs256k]> {
    const [publicKey, privateKey] = await Jwk.generateEs256kKeyPair();
    const publicKeyModel = {
      id,
      type: 'EcdsaSecp256k1VerificationKey2019',
      jwk: publicKey,
      purpose: purpose || Object.values(PublicKeyPurpose)
    };

    return [publicKeyModel, privateKey];
  }

  /**
   * Generates an anchored create operation.
   */
  public static async generateAnchoredCreateOperation (input: AnchoredCreateOperationGenerationInput) {
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
      operationRequest: createOperationData.operationRequest,
      anchoredOperationModel,
      recoveryPublicKey: createOperationData.recoveryPublicKey,
      recoveryPrivateKey: createOperationData.recoveryPrivateKey,
      updatePublicKey: createOperationData.updatePublicKey,
      updatePrivateKey: createOperationData.updatePrivateKey,
      signingPublicKey: createOperationData.signingPublicKey,
      signingPrivateKey: createOperationData.signingPrivateKey
    };
  }

  /**
   * Generates a create operation.
   */
  public static async generateCreateOperation () {
    const signingKeyId = 'signingKey';
    const [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
    const [updatePublicKey, updatePrivateKey] = await Jwk.generateEs256kKeyPair();
    const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair(signingKeyId);
    const service = OperationGenerator.generateServiceEndpoints(['serviceEndpointId123']);

    const operationRequest = await OperationGenerator.generateCreateOperationRequest(
      recoveryPublicKey,
      updatePublicKey,
      [signingPublicKey],
      service
    );

    const operationBuffer = Buffer.from(JSON.stringify(operationRequest));

    const createOperation = await CreateOperation.parse(operationBuffer);

    return {
      createOperation,
      operationRequest,
      recoveryPublicKey,
      recoveryPrivateKey,
      updatePublicKey,
      updatePrivateKey,
      signingPublicKey,
      signingPrivateKey
    };
  }

  /**
   * Generates a recover operation.
   */
  public static async generateRecoverOperation (input: RecoverOperationGenerationInput): Promise<GeneratedRecoverOperationData> {
    const newSigningKeyId = 'newSigningKey';
    const [newRecoveryPublicKey, newRecoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
    const [newSigningPublicKey, newSigningPrivateKey] = await OperationGenerator.generateKeyPair(newSigningKeyId);
    const [publicKeyToBeInDocument] = await OperationGenerator.generateKeyPair('newKey');
    const services = OperationGenerator.generateServiceEndpoints(['serviceEndpointId123']);

    // Generate the next update and recover operation commitment hash reveal value pair.
    const [updateKey, updatePrivateKey] = await OperationGenerator.generateKeyPair('updateKey');

    const operationJson = await OperationGenerator.generateRecoverOperationRequest(
      input.didUniqueSuffix,
      input.recoveryPrivateKey,
      newRecoveryPublicKey,
      newSigningPublicKey,
      services,
      [publicKeyToBeInDocument]
    );

    const operationBuffer = Buffer.from(JSON.stringify(operationJson));
    const recoverOperation = await RecoverOperation.parse(operationBuffer);

    return {
      recoverOperation,
      operationBuffer,
      recoveryPublicKey: newRecoveryPublicKey,
      recoveryPrivateKey: newRecoveryPrivateKey,
      signingPublicKey: newSigningPublicKey,
      signingPrivateKey: newSigningPrivateKey,
      updateKey,
      updatePrivateKey
    };
  }

  /**
   * Generates an update operation that adds a new key.
   */
  public static async generateUpdateOperation (didUniqueSuffix: string, updatePublicKey: JwkEs256k, updatePrivateKey: JwkEs256k) {
    const additionalKeyId = `additional-key`;
    const [additionalPublicKey, additionalPrivateKey] = await OperationGenerator.generateKeyPair(additionalKeyId);

    const operationJson = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix,
      updatePublicKey,
      updatePrivateKey,
      additionalPublicKey,
      Multihash.canonicalizeThenDoubleHashThenEncode(additionalPublicKey)
    );

    const operationBuffer = Buffer.from(JSON.stringify(operationJson));
    const updateOperation = await UpdateOperation.parse(operationBuffer);

    return {
      updateOperation,
      operationBuffer,
      additionalKeyId,
      additionalPublicKey,
      additionalPrivateKey,
      nextUpdateKey: additionalPublicKey.jwk
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
   */
  public static async generateCreateOperationRequest (
    recoveryPublicKey: JwkEs256k,
    updatePublicKey: JwkEs256k,
    otherPublicKeys: PublicKeyModel[],
    serviceEndpoints?: ServiceEndpointModel[]) {
    const document: DocumentModel = {
      public_keys: otherPublicKeys,
      service_endpoints: serviceEndpoints
    };

    const patches = [{
      action: 'replace',
      document
    }];

    const delta = {
      update_commitment: Multihash.canonicalizeThenDoubleHashThenEncode(updatePublicKey),
      patches
    };

    const deltaBuffer = Buffer.from(JSON.stringify(delta));
    const deltaHash = Encoder.encode(Multihash.hash(deltaBuffer));

    const suffixData = {
      delta_hash: deltaHash,
      recovery_commitment: Multihash.canonicalizeThenDoubleHashThenEncode(recoveryPublicKey)
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
    const [nextUpdateKey] = await OperationGenerator.generateKeyPair('nextUpdateKey');
    const nextUpdateCommitmentHash = Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.jwk);
    const anyNewSigningPublicKeyId = 'anyNewKey';
    const [anyNewSigningKey] = await OperationGenerator.generateKeyPair(anyNewSigningPublicKeyId);
    const patches = [
      {
        action: 'add-public-keys',
        public_keys: [
          anyNewSigningKey
        ]
      }
    ];
    const signingKeyId = 'anySigningKeyId';
    const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair(signingKeyId);
    const request = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      signingPublicKey.jwk,
      signingPrivateKey,
      nextUpdateCommitmentHash,
      patches
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
    updatePublicKey: JwkEs256k,
    updatePrivateKey: JwkEs256k,
    nextUpdateCommitmentHash: string,
    patches: any
  ) {
    const delta = {
      patches,
      update_commitment: nextUpdateCommitmentHash
    };
    const deltaJsonString = JSON.stringify(delta);
    const deltaHash = Encoder.encode(Multihash.hash(Buffer.from(deltaJsonString)));
    const encodedDeltaString = Encoder.encode(deltaJsonString);

    const signedDataPayloadObject = {
      update_key: updatePublicKey,
      delta_hash: deltaHash
    };
    const signedData = await OperationGenerator.signUsingEs256k(signedDataPayloadObject, updatePrivateKey);

    const updateOperationRequest = {
      type: OperationType.Update,
      did_suffix: didUniqueSuffix,
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
    recoveryPrivateKey: JwkEs256k,
    newRecoveryPublicKey: JwkEs256k,
    newSigningPublicKey: PublicKeyModel,
    serviceEndpoints?: ServiceEndpointModel[],
    publicKeys?: PublicKeyModel[]) {
    const document = {
      public_keys: publicKeys,
      service_endpoints: serviceEndpoints
    };
    const recoverOperation = await OperationGenerator.createRecoverOperationRequest(
      didUniqueSuffix, recoveryPrivateKey, newRecoveryPublicKey, Multihash.canonicalizeThenDoubleHashThenEncode(newSigningPublicKey.jwk), document
    );
    return recoverOperation;
  }

  /**
   * Creates a recover operation request.
   */
  public static async createRecoverOperationRequest (
    didUniqueSuffix: string,
    recoveryPrivateKey: JwkEs256k,
    newRecoveryPublicKey: JwkEs256k,
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
      recovery_key: Jwk.getEs256kPublicKey(recoveryPrivateKey),
      recovery_commitment: Multihash.canonicalizeThenDoubleHashThenEncode(newRecoveryPublicKey)
    };
    const signedData = await OperationGenerator.signUsingEs256k(signedDataPayloadObject, recoveryPrivateKey);

    const deltaEncodedString = Encoder.encode(deltaBuffer);
    const operation = {
      type: OperationType.Recover,
      did_suffix: didUniqueSuffix,
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
    recoveryPrivateKey: JwkEs256k) {

    const signedDataPayloadObject = {
      did_suffix: didUniqueSuffix,
      recovery_key: Jwk.getEs256kPublicKey(recoveryPrivateKey)
    };
    const signedData = await OperationGenerator.signUsingEs256k(signedDataPayloadObject, recoveryPrivateKey);

    const operation = {
      type: OperationType.Deactivate,
      did_suffix: didUniqueSuffix,
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
    serviceEndpoints?: ServiceEndpointModel[]
  ): Promise<Buffer> {
    const operation = await OperationGenerator.generateCreateOperationRequest(
      recoveryPublicKey,
      signingPublicKey.jwk,
      [signingPublicKey],
      serviceEndpoints
    );

    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Creates an update operation for adding a key.
   */
  public static async createUpdateOperationRequestForAddingAKey (
    didUniqueSuffix: string,
    updatePublicKey: JwkEs256k,
    updatePrivateKey: JwkEs256k,
    newPublicKey: PublicKeyModel,
    nextUpdateCommitmentHash: string) {

    const patches = [
      {
        action: 'add-public-keys',
        public_keys: [
          newPublicKey
        ]
      }
    ];

    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      updatePublicKey,
      updatePrivateKey,
      nextUpdateCommitmentHash,
      patches
    );

    return updateOperationRequest;
  }

  /**
   * Creates an update operation for adding and/or removing hub service endpoints.
   */
  public static async createUpdateOperationRequestForHubEndpoints (
    didUniqueSuffix: string,
    updatePublicKey: any,
    updatePrivateKey: JwkEs256k,
    nextUpdateCommitmentHash: string,
    idOfServiceEndpointToAdd: string | undefined,
    idsOfServiceEndpointToRemove: string[]) {
    const patches = [];

    if (idOfServiceEndpointToAdd !== undefined) {
      const patch = {
        action: 'add-service-endpoints',
        service_endpoints: OperationGenerator.generateServiceEndpoints([idOfServiceEndpointToAdd])
      };

      patches.push(patch);
    }

    if (idsOfServiceEndpointToRemove.length > 0) {
      const patch = {
        action: 'remove-service-endpoints',
        ids: idsOfServiceEndpointToRemove
      };

      patches.push(patch);
    }

    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      updatePublicKey,
      updatePrivateKey,
      nextUpdateCommitmentHash,
      patches
    );

    return updateOperationRequest;
  }

  /**
   * Signs the given payload as a ES256K compact JWS.
   */
  public static async signUsingEs256k (payload: any, privateKey: JwkEs256k): Promise<string> {
    const protectedHeader = {
      alg: 'ES256K'
    };

    const compactJws = Jws.signAsCompactJws(payload, privateKey, protectedHeader);
    return compactJws;
  }

  /**
   * Generates a Deactivate Operation data.
   */
  public static async createDeactivateOperation (
    didUniqueSuffix: string,
    recoveryPrivateKey: JwkEs256k) {
    const operationRequest = await OperationGenerator.createDeactivateOperationRequest(didUniqueSuffix, recoveryPrivateKey);
    const operationBuffer = Buffer.from(JSON.stringify(operationRequest));
    const deactivateOperation = await DeactivateOperation.parse(operationBuffer);

    return {
      operationRequest,
      operationBuffer,
      deactivateOperation
    };
  }

  /**
   * Generates an array of service endpoints with specified ids
   * @param ids the id field in endpoint.
   */
  public static generateServiceEndpoints (ids: string[]): any[] {
    const serviceEndpoints = [];
    for (const id of ids) {
      serviceEndpoints.push(
        {
          'id': id,
          'type': 'someType',
          'endpoint': 'https://www.url.com'
        }
      );
    }
    return serviceEndpoints;
  }

  /**
   * Generates an anchor file.
   */
  public static async generateAnchorFile (recoveryOperationCount: number): Promise<Buffer> {
    const mapFileUri = 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA';

    const recoverOperations = [];

    for (let i = 0; i < recoveryOperationCount; i++) {
      const [, anyRecoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const anyDid = OperationGenerator.generateRandomHash();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: anyDid, recoveryPrivateKey: anyRecoveryPrivateKey });
      const recoverOperation = recoverOperationData.recoverOperation;

      recoverOperations.push(recoverOperation);
    }
    const anchorFileBuffer = await AnchorFile.createBuffer(undefined, mapFileUri, [], recoverOperations, []);

    return anchorFileBuffer;
  }
}
