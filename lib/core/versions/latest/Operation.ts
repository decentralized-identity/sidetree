import DidPublicKeyModel from './models/DidPublicKeyModel';
import Document from './Document';
import DocumentModel from './models/DocumentModel';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import Jws from './util/Jws';
import JwsModel from './models/JwsModel';
import KeyUsage from './KeyUsage';
import Multihash from './Multihash';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../SidetreeError';

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
  /** The encoded protected header. */
  public readonly encodedProtectedHeader: string;
  /** The encoded operation payload. */
  public readonly encodedPayload: string;

  /**
   * The unique suffix of the DID of the DID document to be created/updated.
   * If this is a create operation waiting to be anchored, a DID unique suffix will be generated based on the current blockchain time.
   */
  public readonly didUniqueSuffix: string;

  /** Hash of the operation based on the encoded payload string. */
  public readonly operationHash: string;

  /** The type of operation. */
  public readonly type: OperationType;
  /** ID of the key used to sign this operation. */
  public readonly signingKeyId: string;
  /** Signature of this operation. */
  public readonly signature: string;

  /** DID document given in the operation, only applicable to create and recovery operations, undefined otherwise. */
  public readonly didDocument?: DocumentModel;
  /** Encoded DID document - mainly used for DID generation. */
  public readonly encodedDidDocument?: string;

  /** Patches to the DID Document, only applicable to update operations, undefined otherwise. */
  public readonly patches?: any[];

  /** One-time password for this update operation. */
  public readonly updateOtp?: string;
  /** One-time password for this recovery/checkpoint/revoke operation. */
  public readonly recoveryOtp?: string;
  /** Hash of the one-time password for the next update operation. */
  public readonly nextUpdateOtpHash?: string;
  /** Hash of the one-time password for this recovery/checkpoint/revoke operation. */
  public readonly nextRecoveryOtpHash?: string;

  /**
   * Constructs an Operation if the operation buffer passes schema validation, throws error otherwise.
   * NOTE: Would love to mark this constructor private to prevent direct calls, but need it to be public for `AnchoredOperation` to inherit from.
   */
  public constructor (operationBuffer: Buffer) {
    this.operationBuffer = operationBuffer;

    // Parse request buffer into a JS object.
    const operationJson = operationBuffer.toString();
    const operation = JSON.parse(operationJson) as JwsModel;

    // Ensure that the operation is well-formed.
    const [decodedHeader, decodedPayload] = Operation.parseAndValidateOperation(operation);

    // Initialize common operation properties.
    this.type = decodedPayload.type;
    this.signingKeyId = decodedHeader.kid;
    this.encodedProtectedHeader = operation.protected;
    this.encodedPayload = operation.payload;
    this.signature = operation.signature;
    this.operationHash = Operation.computeHash(this.encodedPayload);

    // Initialize operation specific properties.
    switch (this.type) {
      case OperationType.Create:
        this.didUniqueSuffix = this.operationHash;
        this.didDocument = decodedPayload.didDocument;
        this.nextRecoveryOtpHash = decodedPayload.nextRecoveryOtpHash;
        this.nextUpdateOtpHash = decodedPayload.nextUpdateOtpHash;
        break;
      case OperationType.Update:
        this.didUniqueSuffix = decodedPayload.didUniqueSuffix;
        this.patches = decodedPayload.patches;
        this.updateOtp = decodedPayload.updateOtp;
        this.nextUpdateOtpHash = decodedPayload.nextUpdateOtpHash;
        break;
      case OperationType.Recover:
        this.didUniqueSuffix = decodedPayload.didUniqueSuffix;
        this.didDocument = decodedPayload.newDidDocument;
        this.recoveryOtp = decodedPayload.recoveryOtp;
        this.nextRecoveryOtpHash = decodedPayload.nextRecoveryOtpHash;
        this.nextUpdateOtpHash = decodedPayload.nextUpdateOtpHash;
        break;
      case OperationType.Delete:
        this.didUniqueSuffix = decodedPayload.didUniqueSuffix;
        this.recoveryOtp = decodedPayload.recoveryOtp;
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
    const verified = await Jws.verifySignature(this.encodedProtectedHeader, this.encodedPayload, this.signature, publicKey);
    return verified;
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
        if (!publicKeySet.has(publicKey.id)) {
          // Add the controller property. This cannot be added by the client and can
          // only be set by the server side
          publicKey.controller = didDocument.id;
          didDocument.publicKey.push(publicKey);
        }
      }
    } else if (patch.action === 'remove-public-keys') {
      const publicKeyMap = new Map(didDocument.publicKey.map(publicKey => [publicKey.id, publicKey]));

      // Loop through all given public key IDs and delete them from the existing public key only if it is not a recovery key.
      for (let publicKey of patch.publicKeys) {
        const existingKey = publicKeyMap.get(publicKey);

        // Deleting recovery key is NOT allowed.
        if (existingKey !== undefined &&
            existingKey.usage !== KeyUsage.recovery) {
          publicKeyMap.delete(publicKey);
        }
      }

      didDocument.publicKey = [...publicKeyMap.values()];
    } else if (patch.action === 'add-service-endpoints') {
      // Find the service of the given service type.
      let service = undefined;
      if (didDocument.service !== undefined) {
        service = didDocument.service.find(service => service.type === patch.serviceType);
      }

      // If service not found, create a new service element and add it to the property.
      if (service === undefined) {
        service = {
          type: patch.serviceType,
          serviceEndpoint: {
            '@context': 'schema.identity.foundation/hub',
            '@type': 'UserServiceEndpoint',
            instances: patch.serviceEndpoints
          }
        };

        if (didDocument.service === undefined) {
          didDocument.service = [service];
        } else {
          didDocument.service.push(service);
        }
      } else {
        // Else we add to the eixsting service element.

        const serviceEndpointSet = new Set(service.serviceEndpoint.instances);

        // Loop through all given service endpoints and add them if they don't exist already.
        for (let serviceEndpoint of patch.serviceEndpoints) {
          if (!serviceEndpointSet.has(serviceEndpoint)) {
            service.serviceEndpoint.instances.push(serviceEndpoint);
          }
        }
      }
    } else if (patch.action === 'remove-service-endpoints') {
      let service = undefined;
      if (didDocument.service !== undefined) {
        service = didDocument.service.find(service => service.type === patch.serviceType);
      }

      if (service === undefined) {
        return;
      }

      const serviceEndpointSet = new Set(service.serviceEndpoint.instances);

      // Loop through all given public key IDs and add them from the existing public key set.
      for (let serviceEndpoint of patch.serviceEndpoints) {
        serviceEndpointSet.delete(serviceEndpoint);
      }

      service.serviceEndpoint.instances = [...serviceEndpointSet];
    }
  }

  /**
   * Parses and validates the given operation object object.
   * NOTE: Operation validation does not include signature verification.
   * @returns [decoded protected header JSON object, decoded payload JSON object] if given operation JWS is valid, Error is thrown otherwise.
   */
  private static parseAndValidateOperation (operation: any): [{ kid: string; operation: OperationType }, any] {
    const decodedProtectedHeadJsonString = Encoder.decodeAsString(operation.protected);
    const decodedProtectedHeader = JSON.parse(decodedProtectedHeadJsonString);

    const headerProperties = Object.keys(decodedProtectedHeader);
    if (headerProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.OperationHeaderMissingOrUnknownProperty);
    }

    // 'header' property and 'header' property must contain a string 'kid' property.
    if (typeof decodedProtectedHeader.kid !== 'string') {
      throw new SidetreeError(ErrorCode.OperationHeaderMissingOrIncorrectKid);
    }

    // 'header' property must contain 'alg' property with value 'ES256k'.
    if (decodedProtectedHeader.alg !== 'ES256K') {
      throw new SidetreeError(ErrorCode.OperationHeaderMissingOrIncorrectAlg);
    }

    // Must contain string 'signature' property.
    if (typeof operation.signature !== 'string') {
      throw new SidetreeError(ErrorCode.OperationMissingOrIncorrectSignature);
    }

    // Decode the encoded operation string.
    const decodedPayloadJson = Encoder.decodeAsString(operation.payload);
    const decodedPayload = JSON.parse(decodedPayloadJson);

    // Get the operation type.
    const operationType = decodedPayload.type;

    // 'type' property must be one of the allowed strings.
    const allowedOperations = new Set(Object.values(OperationType));
    if (typeof operationType !== 'string' ||
        !allowedOperations.has(operationType as OperationType)) {
      throw new SidetreeError(ErrorCode.OperationPayloadMissingOrIncorrectType);
    }

    // Verify operation specific payload schema.
    switch (operationType) {
      case OperationType.Create:
        Operation.validateCreatePayload(decodedPayload);
        break;
      case OperationType.Update:
        Operation.validateUpdatePayload(decodedPayload);
        break;
      case OperationType.Recover:
        Operation.validateRecoverPayload(decodedPayload);
        break;
      case OperationType.Delete:
      default:
    }

    return [decodedProtectedHeader, decodedPayload];
  }

  /**
   * Validates the schema given create operation payload.
   * @throws Error if given operation payload fails validation.
   */
  public static validateCreatePayload (payload: any) {
    const payloadProperties = Object.keys(payload);
    if (payloadProperties.length !== 4) {
      throw new SidetreeError(ErrorCode.OperationCreatePayloadMissingOrUnknownProperty);
    }

    if (typeof payload.nextRecoveryOtpHash !== 'string') {
      throw new SidetreeError(ErrorCode.OperationCreatePayloadHasMissingOrInvalidNextRecoveryOtpHash);
    }

    if (typeof payload.nextUpdateOtpHash !== 'string') {
      throw new SidetreeError(ErrorCode.OperationCreatePayloadHasMissingOrInvalidNextUpdateOtpHash);
    }

    const validDocument = Document.isObjectValidOriginalDocument(payload.didDocument);
    if (!validDocument) {
      throw new SidetreeError(ErrorCode.OperationCreateInvalidDidDocument);
    }

    const nextRecoveryOtpHash = Encoder.decodeAsBuffer(payload.nextRecoveryOtpHash);
    const nextUpdateOtpHash = Encoder.decodeAsBuffer(payload.nextUpdateOtpHash);

    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextRecoveryOtpHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextUpdateOtpHash);
  }

  /**
   * Validates the schema given update operation payload.
   * @throws Error if given operation payload fails validation.
   */
  public static validateUpdatePayload (payload: any) {
    const payloadProperties = Object.keys(payload);
    if (payloadProperties.length !== 5) {
      throw new SidetreeError(ErrorCode.OperationUpdatePayloadMissingOrUnknownProperty);
    }

    if (typeof payload.didUniqueSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.OperationUpdatePayloadMissingOrInvalidDidUniqueSuffixType);
    }

    if (typeof payload.updateOtp !== 'string') {
      throw new SidetreeError(ErrorCode.OperationUpdatePayloadMissingOrInvalidUpdateOtp);
    }

    if (typeof payload.nextUpdateOtpHash !== 'string') {
      throw new SidetreeError(ErrorCode.OperationUpdatePayloadMissingOrInvalidNextUpdateOtpHash);
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
      if (publicKeyProperties.length !== 4) {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyMissingOrUnknownProperty);
      }

      if (typeof publicKey.id !== 'string') {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyIdNotString);
      }

      if (publicKey.usage === KeyUsage.recovery) {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyAddRecoveryKeyNotAllowed);
      }

      if (publicKey.controller !== undefined) {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyControllerNotAllowed);
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
      if (typeof serviceEndpoint !== 'string') {
        throw new SidetreeError(ErrorCode.OperationUpdatePatchServiceEndpointNotString);
      }
    }
  }

  /**
   * Validates the schema given recover operation payload.
   * @throws Error if given operation payload fails validation.
   */
  public static validateRecoverPayload (payload: any) {
    const payloadProperties = Object.keys(payload);
    if (payloadProperties.length !== 6) {
      throw new SidetreeError(ErrorCode.OperationRecoverPayloadHasMissingOrUnknownProperty);
    }

    if (typeof payload.didUniqueSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.OperationRecoverPayloadHasMissingOrInvalidDidUniqueSuffixType);
    }

    if (typeof payload.recoveryOtp !== 'string') {
      throw new SidetreeError(ErrorCode.OperationRecoverPayloadHasMissingOrInvalidRecoveryOtp);
    }

    if (typeof payload.nextRecoveryOtpHash !== 'string') {
      throw new SidetreeError(ErrorCode.OperationRecoverPayloadHasMissingOrInvalidNextRecoveryOtpHash);
    }

    if (typeof payload.nextUpdateOtpHash !== 'string') {
      throw new SidetreeError(ErrorCode.OperationRecoverPayloadHasMissingOrInvalidNextUpdateOtpHash);
    }

    const validDocument = Document.isObjectValidOriginalDocument(payload.newDidDocument);
    if (!validDocument) {
      throw new SidetreeError(ErrorCode.OperationRecoverPayloadHasMissingOrInvalidDidDocument);
    }
  }
}
