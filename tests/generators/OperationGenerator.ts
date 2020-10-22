import * as crypto from 'crypto';
import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import DataGenerator from './DataGenerator';
import DeactivateOperation from '../../lib/core/versions/latest/DeactivateOperation';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import Encoder from '../../lib/core/versions/latest/Encoder';
import JsonCanonicalizer from '../../lib/core/versions/latest/util/JsonCanonicalizer';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import JwkEs256k from '../../lib/core/models/JwkEs256k';
import Jws from '../../lib/core/versions/latest/util/Jws';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationModel from '../../lib/core/versions/latest/models/OperationModel';
import OperationType from '../../lib/core/enums/OperationType';
import PublicKeyModel from '../../lib/core/versions/latest/models/PublicKeyModel';
import PublicKeyPurpose from '../../lib/core/versions/latest/PublicKeyPurpose';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import ServiceModel from '../../lib/core/versions/latest/models/ServiceModel';
import TransactionModel from '../../lib/common/models/TransactionModel';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';

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
   * Generates a random multihash.
   */
  public static generateRandomHash (): string {
    const randomBuffer = crypto.randomBytes(32);
    const randomHash = Encoder.encode(Multihash.hash(randomBuffer));

    return randomHash;
  }

  /**
   * Generates SECP256K1 key pair to be used in an operation. If purposes not supplied, all purposes will be included
   * Mainly used for testing.
   * @returns [publicKey, privateKey]
   */
  public static async generateKeyPair (id: string, purposes?: PublicKeyPurpose[]): Promise<[PublicKeyModel, JwkEs256k]> {
    const [publicKey, privateKey] = await Jwk.generateEs256kKeyPair();
    const publicKeyModel = {
      id,
      type: 'EcdsaSecp256k1VerificationKey2019',
      publicKeyJwk: publicKey,
      purposes: purposes || Object.values(PublicKeyPurpose)
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
   * generate a long form did
   * @param recoveryPublicKey
   * @param updatePublicKey
   * @param otherPublicKeys
   * @param services
   */
  public static async generateLongFormDid (
    otherPublicKeys?: PublicKeyModel[],
    services?: ServiceModel[],
    network?: string) {

    const document = {
      publicKeys: otherPublicKeys || [],
      services: services || []
    };

    const patches = [{
      action: 'replace',
      document
    }];

    const [recoveryPublicKey] = await Jwk.generateEs256kKeyPair();
    const [updatePublicKey] = await Jwk.generateEs256kKeyPair();

    const delta = {
      updateCommitment: Multihash.canonicalizeThenDoubleHashThenEncode(updatePublicKey),
      patches
    };

    const deltaHash = Multihash.canonicalizeThenHashThenEncode(delta);

    const suffixData = {
      deltaHash: deltaHash,
      recoveryCommitment: Multihash.canonicalizeThenDoubleHashThenEncode(recoveryPublicKey)
    };

    const didUniqueSuffix = CreateOperation['computeJcsDidUniqueSuffix'](suffixData);

    const shortFormDid = network ? `did:sidetree:${network}:${didUniqueSuffix}` : `did:sidetree:${didUniqueSuffix}`;

    const initialState = {
      suffixData: suffixData,
      delta: delta
    };

    const canonicalizedInitialStateBuffer = JsonCanonicalizer.canonicalizeAsBuffer(initialState);
    const encodedCanonicalizedInitialStateString = Encoder.encode(canonicalizedInitialStateBuffer);

    const longFormDid = `${shortFormDid}:${encodedCanonicalizedInitialStateString}`;
    return {
      longFormDid,
      shortFormDid,
      didUniqueSuffix
    };
  }

  /**
   * Generates a long from from create operation data.
   */
  public static async longFormFromCreateOperationData (createOperationData: any, network?: string) {

    const delta = {
      updateCommitment: Multihash.canonicalizeThenDoubleHashThenEncode(createOperationData.updatePublicKey),
      patches: createOperationData.createOperation.delta.patches
    };

    const deltaHash = Multihash.canonicalizeThenHashThenEncode(delta);

    const suffixData = {
      deltaHash: deltaHash,
      recoveryCommitment: Multihash.canonicalizeThenDoubleHashThenEncode(createOperationData.recoveryPublicKey)
    };

    const didUniqueSuffix = CreateOperation['computeJcsDidUniqueSuffix'](suffixData);

    const shortFormDid = network ? `did:sidetree:${network}:${didUniqueSuffix}` : `did:sidetree:${didUniqueSuffix}`;

    const initialState = {
      suffixData: suffixData,
      delta: delta
    };

    const canonicalizedInitialStateBuffer = JsonCanonicalizer.canonicalizeAsBuffer(initialState);
    const encodedCanonicalizedInitialStateString = Encoder.encode(canonicalizedInitialStateBuffer);

    const longFormDid = `${shortFormDid}:${encodedCanonicalizedInitialStateString}`;
    return {
      longFormDid,
      shortFormDid,
      didUniqueSuffix
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
    const services = OperationGenerator.generateServices(['serviceId123']);

    const operationRequest = await OperationGenerator.generateCreateOperationRequest(
      recoveryPublicKey,
      updatePublicKey,
      [signingPublicKey],
      services
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
    const services = OperationGenerator.generateServices(['serviceId123']);

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
      nextUpdateKey: additionalPublicKey.publicKeyJwk
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
    services?: ServiceModel[]) {
    const document: DocumentModel = {
      publicKeys: otherPublicKeys,
      services
    };

    const patches = [{
      action: 'replace',
      document
    }];

    const delta = {
      updateCommitment: Multihash.canonicalizeThenDoubleHashThenEncode(updatePublicKey),
      patches
    };

    const deltaHash = Multihash.canonicalizeThenHashThenEncode(delta);

    const suffixData = {
      deltaHash: deltaHash,
      recoveryCommitment: Multihash.canonicalizeThenDoubleHashThenEncode(recoveryPublicKey)
    };

    const operation = {
      type: OperationType.Create,
      suffixData: suffixData,
      delta: delta
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
    const nextUpdateCommitmentHash = Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.publicKeyJwk);
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
    const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair(signingKeyId);
    const request = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      signingPublicKey.publicKeyJwk,
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
      updateCommitment: nextUpdateCommitmentHash
    };
    const deltaHash = Multihash.canonicalizeThenHashThenEncode(delta);

    const signedDataPayloadObject = {
      updateKey: updatePublicKey,
      deltaHash: deltaHash
    };
    const signedData = await OperationGenerator.signUsingEs256k(signedDataPayloadObject, updatePrivateKey);

    const updateOperationRequest = {
      type: OperationType.Update,
      didSuffix: didUniqueSuffix,
      delta: delta,
      signedData: signedData
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
    services?: ServiceModel[],
    publicKeys?: PublicKeyModel[]) {
    const document = {
      publicKeys: publicKeys,
      services
    };
    const recoverOperation = await OperationGenerator.createRecoverOperationRequest(
      didUniqueSuffix, recoveryPrivateKey, newRecoveryPublicKey, Multihash.canonicalizeThenDoubleHashThenEncode(newSigningPublicKey.publicKeyJwk), document
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
      updateCommitment: nextUpdateCommitmentHash
    };

    const deltaHash = Multihash.canonicalizeThenHashThenEncode(delta);

    const signedDataPayloadObject = {
      deltaHash: deltaHash,
      recoveryKey: Jwk.getEs256kPublicKey(recoveryPrivateKey),
      recoveryCommitment: Multihash.canonicalizeThenDoubleHashThenEncode(newRecoveryPublicKey)
    };
    const signedData = await OperationGenerator.signUsingEs256k(signedDataPayloadObject, recoveryPrivateKey);

    const operation = {
      type: OperationType.Recover,
      didSuffix: didUniqueSuffix,
      signedData: signedData,
      delta: delta
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
      didSuffix: didUniqueSuffix,
      recoveryKey: Jwk.getEs256kPublicKey(recoveryPrivateKey)
    };
    const signedData = await OperationGenerator.signUsingEs256k(signedDataPayloadObject, recoveryPrivateKey);

    const operation = {
      type: OperationType.Deactivate,
      didSuffix: didUniqueSuffix,
      signedData: signedData
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
    services?: ServiceModel[]
  ): Promise<Buffer> {
    const operation = await OperationGenerator.generateCreateOperationRequest(
      recoveryPublicKey,
      signingPublicKey.publicKeyJwk,
      [signingPublicKey],
      services
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
        publicKeys: [
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
   * Generate an update operation for adding and/or removing services.
   */
  public static async generateUpdateOperationRequestForServices (
    didUniqueSuffix: string,
    updatePublicKey: any,
    updatePrivateKey: JwkEs256k,
    nextUpdateCommitmentHash: string,
    idOfServiceEndpointToAdd: string | undefined,
    idsOfServiceEndpointToRemove: string[]) {
    const patches = [];

    if (idOfServiceEndpointToAdd !== undefined) {
      const patch = {
        action: 'add-services',
        services: OperationGenerator.generateServices([idOfServiceEndpointToAdd])
      };

      patches.push(patch);
    }

    if (idsOfServiceEndpointToRemove.length > 0) {
      const patch = {
        action: 'remove-services',
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
   * Generates an array of services with specified ids
   * @param ids the id field in endpoint.
   */
  public static generateServices (ids: string[]): any[] {
    const services = [];
    for (const id of ids) {
      services.push(
        {
          id: id,
          type: 'someType',
          endpoint: 'https://www.url.com'
        }
      );
    }
    return services;
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
