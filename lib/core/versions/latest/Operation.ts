import Cryptography from './util/Cryptography';
import Did from './Did';
import DidPublicKeyModel from '../latest/models/DidPublicKeyModel';
import Document from './Document';
import DocumentModel from './models/DocumentModel';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import Multihash from './Multihash';
import OperationModel from './models/OperationModel';
import ProtocolParameters from './ProtocolParameters';
import { PrivateKey } from '@decentralized-identity/did-auth-jose';
import { SidetreeError } from '../../Error';

/**
 * Sidetree operation types.
 */
export enum OperationType {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  Recover = 'recover'
}

/**
 * A class that represents a Sidetree operation.
 * The primary purphose of this class is to provide an abstraction to the underlying JSON data structure.
 *
 * NOTE: Design choices of:
 * 1. No subclassing of specific operations. The intention here is to keep the hierarchy flat, as most properties are common.
 * 2. Factory method to hide constructor in case subclassing becomes useful in the future. Most often a good practice anyway.
 */
export default class Operation {
  /** The original request buffer sent by the requester. */
  public readonly operationBuffer: Buffer;

  /**
   * The unique suffix of the DID of the DID document to be created/updated.
   * If this is a create operation waiting to be anchored, a DID unique suffix will be generated based on the current blockchain time.
   */
  public readonly didUniqueSuffix: string;

  /** Hash of the operation based on the encoded payload string. */
  public readonly operationHash: string;
  /** The encoded operation payload. */
  public readonly encodedPayload: string;
  /** The type of operation. */
  public readonly type: OperationType;
  /** The hash of the previous operation - undefined for DID create operation */
  public readonly previousOperationHash?: string;
  /** ID of the key used to sign this operation. */
  public readonly signingKeyId: string;
  /** Signature of this operation. */
  public readonly signature: string;

  /** DID document given in the operation, only applicable to create and recovery operations, undefined otherwise. */
  public readonly didDocument?: DocumentModel;

  /** Patches to the DID Document, only applicable to update operations, undefined otherwise. */
  public readonly patches?: any[];

  /**
   * Constructs an Operation if the operation buffer passes schema validation, throws error otherwise.
   * NOTE: Would love to mark this constructor private to prevent direct calls, but need it to be public for `AnchoredOperation` to inherit from.
   */
  public constructor (operationBuffer: Buffer) {
    this.operationBuffer = operationBuffer;

    // Parse request buffer into a JS object.
    const operationJson = operationBuffer.toString();
    const operation = JSON.parse(operationJson);

    // Ensure that the operation is well-formed.
    const [operationType, decodedPayload] = Operation.parseAndValidateOperation(operation);

    // Initialize common operation properties.
    this.type = operationType;
    this.signingKeyId = operation.header.kid;
    this.encodedPayload = operation.payload;
    this.signature = operation.signature;
    this.operationHash = Operation.computeHash(this.encodedPayload);

    // Initialize operation specific properties.
    switch (this.type) {
      case OperationType.Create:
        this.didUniqueSuffix = this.operationHash;
        break;
      case OperationType.Update:
        this.didUniqueSuffix = decodedPayload.didUniqueSuffix;
        this.previousOperationHash = decodedPayload.previousOperationHash;
        this.patches = decodedPayload.patches;
        break;
      case OperationType.Delete:
        this.didUniqueSuffix = decodedPayload.didUniqueSuffix;
        break;
      default:
        throw new Error(`Not implemented operation type ${this.type}.`);
    }
  }

  /**
   * Creates an Operation that has not been anchored on the blockchain.
   * @throws Error if given operation buffer fails any validation.
   */
  public static create (operationBuffer: Buffer) {
    return new Operation(operationBuffer);
  }

  /**
   * Verifies the operation is signed correctly.
   * @param publicKey The public key used for verification.
   * @returns true if signature is successfully verified, false otherwise.
   */
  public async verifySignature (publicKey: DidPublicKeyModel): Promise<boolean> {
    // JWS Signing Input spec: ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))
    // NOTE: there is no protected header in Sidetree operation.
    const jwsSigningInput = '.' + this.encodedPayload;
    const verified = await Cryptography.verifySignature(jwsSigningInput, this.signature, publicKey);
    return verified;
  }

  /**
   * Signs the given encoded payload using the given private key.
   * @param privateKey A SECP256K1 private-key either in HEX string format or JWK format.
   */
  public static async sign (encodedPayload: string, privateKey: string | PrivateKey): Promise<string> {
    // JWS Signing Input spec: ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))
    // NOTE: there is no protected header in Sidetree operation.
    const jwsSigningInput = '.' + encodedPayload;
    const signature = await Cryptography.sign(jwsSigningInput, privateKey);
    return signature;
  }

  /**
   * Computes the cryptographic multihash of the given string.
   */
  private static computeHash (dataString: string): string {
    const hashAlgorithmInMultihashCode = ProtocolParameters.hashAlgorithmInMultihashCode;
    const encodedOperationPayloadBuffer = Buffer.from(dataString);
    const multihash = Multihash.hash(encodedOperationPayloadBuffer, hashAlgorithmInMultihashCode);
    const encodedMultihash = Encoder.encode(multihash);
    return encodedMultihash;
  }

  /**
   * Applies the given patches in order to the given DID Document.
   * NOTE: Assumes no schema validation is needed.
   */
  public static applyPatchesToDidDocument (didDocument: DocumentModel, patches: any[]) {
    // Loop through and apply all patches.
    for (let patch of patches) {
      Operation.applyPatchToDidDocument(didDocument, patch);
    }
  }

  /**
   * Applies the given patch to the given DID Document.
   */
  private static applyPatchToDidDocument (didDocument: DocumentModel, patch: any) {
    if (patch.action === 'add-public-keys') {
      const publicKeySet = new Set(didDocument.publicKey.map(key => key.id));

      // Loop through all given public keys and add them if they don't exist already.
      for (let publicKey of patch.publicKeys) {
        if (!publicKeySet.has(publicKey)) {
          didDocument.publicKey.push(publicKey);
        }
      }
    } else if (patch.action === 'remove-public-keys') {
      const publicKeyMap = new Map(didDocument.publicKey.map(publicKey => [publicKey.id, publicKey]));

      // Loop through all given public key IDs and add them from the existing public key set.
      for (let publicKey of patch.publicKeys) {
        publicKeyMap.delete(publicKey);
      }

      didDocument.publicKey = [...publicKeyMap.values()];
    } else if (patch.action === 'add-service-endpoints') {
      // Find the service of the given service type.
      let service = didDocument.service.find(service => service.type === patch.serviceType);

      // If service not found, create a new service element and add it to the property.
      if (service === undefined) {
        service = {
          type: patch.serviceType,
          serviceEndpoint: {
            '@context': 'schema.identity.foundation/hub',
            '@type': 'UserServiceEndpoint',
            instance: patch.serviceEndpoints
          }
        };

        didDocument.service.push(service);
      } else {
        // Else we add to the eixsting service element.

        const serviceEndpointSet = new Set(service.serviceEndpoint.instance);

        // Loop through all given service endpoints and add them if they don't exist already.
        for (let serviceEndpoint of patch.serviceEndpoints) {
          if (!serviceEndpointSet.has(serviceEndpoint)) {
            service.serviceEndpoint.instance.push(serviceEndpoint);
          }
        }
      }
    } else if (patch.action === 'remove-service-endpoints') {
      let service = didDocument.service.find(service => service.type === patch.serviceType);

      if (service === undefined) {
        return;
      }

      const serviceEndpointSet = new Set(service.serviceEndpoint.instance);

      // Loop through all given public key IDs and add them from the existing public key set.
      for (let serviceEndpoint of patch.serviceEndpoints) {
        serviceEndpointSet.delete(serviceEndpoint);
      }

      service.serviceEndpoint.instance = [...serviceEndpointSet];
    }
  }

  /**
   * Gets the operation type given an operation object.
   */
  private static getOperationType (operation: OperationModel): OperationType {
    switch (operation.header.operation) {
      case 'create':
        return OperationType.Create;
      case 'update':
        return OperationType.Update;
      case 'delete':
        return OperationType.Delete;
      case 'recover':
        return OperationType.Recover;
      default:
        throw new Error(`Unknown operation type: ${operation.header.operation}`);
    }
  }

  /**
   * Parses and validates the given operation object object.
   * NOTE: Operation validation does not include signature verification.
   * @returns [operation type, decoded payload json object] if given operation is valid, Error is thrown otherwise.
   */
  private static parseAndValidateOperation (operation: any): [OperationType, any] {
    // Must contain 'header' property and 'header' property must contain a string 'kid' property.
    if (typeof operation.header.kid !== 'string') {
      throw new SidetreeError(ErrorCode.OperationHeaderMissingKid);
    }

    // 'header' property must contain 'alg' property with value 'ES256k'.
    if (operation.header.alg !== 'ES256K') {
      throw new SidetreeError(ErrorCode.OperationHeaderMissingOrIncorrectAlg);
    }

    // 'operation' property must exist inside 'header' property and must be one of the allowed strings.
    const allowedOperations = new Set(['create', 'update', 'delete', 'recover']);
    if (typeof operation.header.operation !== 'string' ||
        !allowedOperations.has(operation.header.operation)) {
      throw new SidetreeError(ErrorCode.OperationHeaderMissingOrIncorrectOperation);
    }

    // Must contain string 'payload' property.
    if (typeof operation.payload !== 'string') {
      throw new SidetreeError(ErrorCode.OperationMissingOrIncorrectPayload);
    }

    // Must contain string 'signature' property.
    if (typeof operation.signature !== 'string') {
      throw new SidetreeError(ErrorCode.OperationMissingOrIncorrectSignature);
    }

    // Get the operation type.
    const operationType = Operation.getOperationType(operation);

    // Decode the encoded operation string.
    const decodedPayloadJson = Encoder.decodeAsString(operation.payload);
    const decodedPayload = JSON.parse(decodedPayloadJson);

    // Verify operation specific payload schema.
    switch (operationType) {
      case OperationType.Create:
        const validDocument = Document.isObjectValidOriginalDocument(decodedPayload);
        if (!validDocument) {
          throw new SidetreeError(ErrorCode.OperationCreateInvalidDidDocument);
        }
        break;
      case OperationType.Update:
        Operation.validateUpdatePayload(decodedPayload);
        break;
      case OperationType.Delete:
      case OperationType.Recover:
      default:
    }

    return [operationType, decodedPayload];
  }

  /**
   * Validates the schema given update operation payload.
   * @throws Error if given operation payload fails validation.
   */
  public static validateUpdatePayload (payload: any) {
    const payloadProperties = Object.keys(payload);
    if (payloadProperties.length !== 3) {
      throw new SidetreeError(ErrorCode.OperationUpdatePayloadMissingOrUnknownProperty);
    }

    if (typeof payload.didUniqueSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.OperationUpdatePayloadMissingOrInvalidDidUniqueSuffixType);
    }

    if (typeof payload.previousOperationHash !== 'string') {
      throw new SidetreeError(ErrorCode.OperationUpdatePayloadMissingOrInvalidPreviousOperationHashType);
    }

    // Validate schema of every patch to be applied.
    Operation.validateUpdatePatches(payload.patches);
  }

  private static validateUpdatePatches (patches: any) {
    if (!Array.isArray(patches)) {
      throw new SidetreeError(ErrorCode.OperationUpdatePatchesNotArray);
    }

    for (let patch of patches) {
      Operation.validateUpdatePatch(patch);
    }
  }

  private static validateUpdatePatch (patch: any) {
    const action = patch.action;
    switch (action) {
      case 'add-public-keys':
        Operation.validateAddPublicKeysPatch(patch);
        break;
      case 'remove-public-keys':
        Operation.validateRemovePublicKeysPatch(patch);
        break;
      case 'add-service-endpoints':
        Operation.validateServiceEndpointsPatch(patch);
        break;
      case 'remove-service-endpoints':
        Operation.validateServiceEndpointsPatch(patch);
        break;
      default:
        throw new SidetreeError(ErrorCode.OperationUpdatePatchMissingOrUnknownAction);
    }
  }

  private static validateAddPublicKeysPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.OperationUpdatePatchMissingOrUnknownProperty);
    }

    if (!Array.isArray(patch.publicKeys)) {
      throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeysNotArray);
    }

    for (let publicKey of patch.publicKeys) {
      const publicKeyProperties = Object.keys(publicKey);
      if (publicKeyProperties.length !== 3) {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyMissingOrUnknownProperty);
      }

      if (typeof publicKey.id !== 'string') {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyIdNotString);
      }

      if (publicKey.type === 'Secp256k1VerificationKey2018') {
        // The key must be in compressed bitcoin-key format.
        if (typeof publicKey.publicKeyHex !== 'string' ||
            publicKey.publicKeyHex.length !== 66) {
          throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyHexMissingOrIncorrect);
        }
      } else if (publicKey.type !== 'RsaVerificationKey2018') {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyTypeMissingOrUnknown);
      }
    }
  }

  private static validateRemovePublicKeysPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.OperationUpdatePatchMissingOrUnknownProperty);
    }

    if (!Array.isArray(patch.publicKeys)) {
      throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeysNotArray);
    }

    for (let publicKeyId of patch.publicKeys) {
      if (typeof publicKeyId !== 'string') {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyIdNotString);
      }
    }
  }

  /**
   * Validates update patch for either adding or removing service endpoints.
   */
  private static validateServiceEndpointsPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 3) {
      throw new SidetreeError(ErrorCode.OperationUpdatePatchMissingOrUnknownProperty);
    }

    if (patch.serviceType !== 'IdentityHub') {
      throw new SidetreeError(ErrorCode.OperationUpdatePatchServiceTypeMissingOrUnknown);
    }

    if (!Array.isArray(patch.serviceEndpoints)) {
      throw new SidetreeError(ErrorCode.OperationUpdatePatchServiceEndpointsNotArray);
    }

    for (let serviceEndpoint of patch.serviceEndpoints) {
      if (typeof serviceEndpoint !== 'string' ||
          !Did.isDid(serviceEndpoint)) {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchServiceEndpointNotDid);
      }
    }
  }
}
