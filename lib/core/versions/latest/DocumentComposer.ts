import DidDocument from './DidDocument';
import DidDocumentModel from './models/DidDocumentModel';
import DocumentState from '../../models/DocumentState';
import ErrorCode from './ErrorCode';
import SidetreeError from '../../../common/SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * Class that handles the composition of operations into final external-facing document.
 */
export default class DocumentComposer {

  /**
   * Transforms the given document state into a DID Document.
   */
  public static transformToExternalDocument (documentState: DocumentState, didMethodName: string): any {
    // If the DID is revoked.
    if (documentState.nextRecoveryOtpHash === undefined) {
      return { status: 'revoked' };
    }

    const did = didMethodName + documentState.didUniqueSuffix;
    const didDocument = {
      '@context': 'https://w3id.org/did/v1',
      publicKey: documentState.document.publicKey,
      service: documentState.document.service,
      recoveryKey: documentState.recoveryKey
    };

    DocumentComposer.addDidToDocument(didDocument, did);

    return didDocument;
  }

  /**
   * Applies the update operation to the given document.
   * @returns The resultant document.
   * @throws SidetreeError if invalid operation is given.
   */
  public static async applyUpdateOperation (operation: UpdateOperation, document: any): Promise<any> {
    // The current document must contain the public key mentioned in the operation ...
    const publicKey = DidDocument.getPublicKey(document, operation.signedOperationDataHash.kid);
    if (!publicKey) {
      throw new SidetreeError(ErrorCode.DocumentComposerKeyNotFound);
    }

    // Verfiy the signature.
    if (!(await operation.signedOperationDataHash.verifySignature(publicKey))) {
      throw new SidetreeError(ErrorCode.DocumentComposerInvalidSignature);
    }

    // The operation passes all checks, apply the patches.
    DocumentComposer.applyPatchesToDidDocument(document, operation.operationData!.documentPatch);

    return document;
  }

  /**
   * Validates the schema of the given full document.
   * @throws SidetreeError if given document patch fails validation.
   */
  public static validateDocument (document: any) {
    // It is fine to have an empty to begin with.
    if (document === undefined) {
      return;
    }

    // Verify 'publicKey' property if it exists.
    if (document.hasOwnProperty('publicKey')) {
      DocumentComposer.validatePublicKeys(document.publicKey);
    }

    // Verify 'service' property if it exists.
    if (document.hasOwnProperty('service')) {
      // 'service' property must be an array.
      if (!Array.isArray(document.service)) {
        throw new SidetreeError(ErrorCode.DocumentComposerServiceNotArray);
      }

      // Verify each service entry in array.
      for (let serviceEntry of document.service) {
        // 'type' is required and must be string type.
        if (typeof serviceEntry.type !== 'string') {
          throw new SidetreeError(ErrorCode.DocumentComposerServiceTypeNotString);
        }

        // 'serviceEndpoint' is required.
        const serviceEntryType = typeof serviceEntry.serviceEndpoint;
        if (serviceEntryType !== 'string' && serviceEntryType !== 'object') {
          throw new SidetreeError(ErrorCode.DocumentComposerServiceEndpointMissingOrIncorrectType);
        }
      }
    }
  }

  /**
   * Validates the schema of the given update document patch.
   * @throws SidetreeError if given document patch fails validation.
   */
  public static validateDocumentPatch (documentPatch: any) {
    if (!Array.isArray(documentPatch)) {
      throw new SidetreeError(ErrorCode.DocumentComposerUpdateOperationDocumentPatchNotArray);
    }

    const patches = documentPatch;
    for (let patch of patches) {
      DocumentComposer.validatePatch(patch);
    }
  }

  private static validatePatch (patch: any) {
    const action = patch.action;
    switch (action) {
      case 'add-public-keys':
        DocumentComposer.validateAddPublicKeysPatch(patch);
        break;
      case 'remove-public-keys':
        DocumentComposer.validateRemovePublicKeysPatch(patch);
        break;
      case 'add-service-endpoints':
        DocumentComposer.validateServiceEndpointsPatch(patch);
        break;
      case 'remove-service-endpoints':
        DocumentComposer.validateServiceEndpointsPatch(patch);
        break;
      default:
        throw new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownAction);
    }
  }

  private static validateAddPublicKeysPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
    }

    DocumentComposer.validatePublicKeys(patch.publicKeys);
  }

  private static validatePublicKeys (publicKeys: any) {
    if (!Array.isArray(publicKeys)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPublicKeysNotArray);
    }

    const publicKeyIdSet: Set<string> = new Set();
    for (let publicKey of publicKeys) {
      const publicKeyProperties = Object.keys(publicKey);
      if (publicKeyProperties.length !== 3) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyMissingOrUnknownProperty);
      }

      if (typeof publicKey.id !== 'string') {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyIdNotString);
      }

      // 'id' must be unique
      if (publicKeyIdSet.has(publicKey.id)) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyIdDuplicated);
      }
      publicKeyIdSet.add(publicKey.id);

      if (publicKey.type === 'Secp256k1VerificationKey2018') {
        // The key must be in compressed bitcoin-key format.
        if (typeof publicKey.publicKeyHex !== 'string' ||
            publicKey.publicKeyHex.length !== 66) {
          throw new SidetreeError(ErrorCode.DocumentComposerPublicKeySecp256k1NotCompressedHex);
        }
      } else if (publicKey.type !== 'RsaVerificationKey2018') {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyTypeMissingOrUnknown);
      }
    }
  }

  private static validateRemovePublicKeysPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
    }

    if (!Array.isArray(patch.publicKeys)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdsNotArray);
    }

    for (let publicKeyId of patch.publicKeys) {
      if (typeof publicKeyId !== 'string') {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdNotString);
      }
    }
  }

  /**
   * Validates update patch for either adding or removing service endpoints.
   */
  private static validateServiceEndpointsPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 3) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
    }

    if (patch.serviceType !== 'IdentityHub') {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceTypeMissingOrUnknown);
    }

    if (!Array.isArray(patch.serviceEndpoints)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointsNotArray);
    }

    for (let serviceEndpoint of patch.serviceEndpoints) {
      if (typeof serviceEndpoint !== 'string') {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointNotString);
      }
    }
  }

  /**
   * Applies the given patches in order to the given DID Document.
   * NOTE: Assumes no schema validation is needed.
   */
  private static applyPatchesToDidDocument (didDocument: DidDocumentModel, patches: any[]) {
    // Loop through and apply all patches.
    for (let patch of patches) {
      DocumentComposer.applyPatchToDidDocument(didDocument, patch);
    }
  }

  /**
   * Applies the given patch to the given DID Document.
   */
  private static applyPatchToDidDocument (didDocument: DidDocumentModel, patch: any) {
    if (patch.action === 'add-public-keys') {
      const publicKeyMap = didDocument.publicKey ? new Map(didDocument.publicKey.map(publicKey => [publicKey.id, publicKey])) : new Map();

      // Loop through all given public keys and add them if they don't exist already.
      for (let publicKey of patch.publicKeys) {
        // NOTE: If a key ID already exists, we will just replace the existing key.
        // Not throwing error will minimize the need (thus risk) of reusing exposed update OTP.
        publicKeyMap.set(publicKey.id, publicKey);
      }

      didDocument.publicKey = [...publicKeyMap.values()];
    } else if (patch.action === 'remove-public-keys') {
      const publicKeyMap = new Map(didDocument.publicKey.map(publicKey => [publicKey.id, publicKey]));

      // Loop through all given public key IDs and delete them from the existing public key only if it is not a recovery key.
      for (let publicKey of patch.publicKeys) {
        const existingKey = publicKeyMap.get(publicKey);

        if (existingKey !== undefined) {
          publicKeyMap.delete(publicKey);
        }
        // NOTE: Else we will just treat this key removal as a no-op.
        // Not throwing error will minimize the need (thus risk) of reusing exposed update OTP.
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
        // Else we add to the existing service element.

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
   * Adds DID references in the given DID document using the given DID
   * because client creating the document will not have these value set.
   * Specifically:
   * 1. `id` is added.
   * 1. `controller` of the public-keys is added.
   *
   * @param didDocument The document to update.
   * @param did The DID which gets added to the document.
   */
  private static addDidToDocument (didDocument: DidDocumentModel, did: string): void {

    didDocument.id = did;

    // Only update the publickey if the array is present
    if (Array.isArray(didDocument.publicKey)) {
      for (let publicKeyEntry of didDocument.publicKey) {
        publicKeyEntry.controller = did;
      }
    }
  }
}
