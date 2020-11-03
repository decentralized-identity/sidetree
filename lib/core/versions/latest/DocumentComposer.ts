import * as URI from 'uri-js';
import ArrayMethods from './util/ArrayMethods';
import DidState from '../../models/DidState';
import DocumentModel from './models/DocumentModel';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import PublicKeyPurpose from './PublicKeyPurpose';
import SidetreeError from '../../../common/SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * Class that handles the composition of operations into final external-facing document.
 */
export default class DocumentComposer {

  /**
   * Transforms the given DID state into a DID Document.
   */
  public static transformToExternalDocument (didState: DidState, did: string, published: boolean): any {
    // If the DID is deactivated.
    if (didState.nextRecoveryCommitmentHash === undefined) {
      return { status: 'deactivated' };
    }

    const document = didState.document as DocumentModel;

    // Only populate `publicKey` if general purpose exists.
    // Only populate `authentication` if authentication purpose exists.
    const authentication: any[] = [];
    const publicKeys: any[] = [];
    if (Array.isArray(document.publicKeys)) {
      for (const publicKey of document.publicKeys) {
        const id = '#' + publicKey.id;
        const didDocumentPublicKey = {
          id: id,
          controller: did,
          type: publicKey.type,
          publicKeyJwk: publicKey.publicKeyJwk
        };
        const purposeSet: Set<string> = new Set(publicKey.purposes);

        if (purposeSet.has(PublicKeyPurpose.VerificationMethod)) {
          publicKeys.push(didDocumentPublicKey);
          if (purposeSet.has(PublicKeyPurpose.Authentication)) {
            // add into authentication by reference if has auth and has general
            authentication.push(id);
          }
        } else if (purposeSet.has(PublicKeyPurpose.Authentication)) {
          // add into authentication by object if has auth but no general
          authentication.push(didDocumentPublicKey);
        }
      }
    }

    // Only update `service` if the array is present
    let services;
    if (Array.isArray(document.services)) {
      services = [];
      for (const service of document.services) {
        const didDocumentService = {
          id: '#' + service.id,
          type: service.type,
          serviceEndpoint: service.serviceEndpoint
        };

        services.push(didDocumentService);
      }
    }

    const didDocument: any = {
      id: did,
      '@context': ['https://www.w3.org/ns/did/v1', { '@base': did }],
      service: services
    };

    if (publicKeys.length !== 0) {
      didDocument.publicKey = publicKeys;
    }

    if (authentication.length !== 0) {
      didDocument.authentication = authentication;
    }

    const didResolutionResult: any = {
      '@context': 'https://www.w3.org/ns/did-resolution/v1',
      didDocument: didDocument,
      methodMetadata: {
        published,
        recoveryCommitment: didState.nextRecoveryCommitmentHash,
        updateCommitment: didState.nextUpdateCommitmentHash
      }
    };

    return didResolutionResult;
  }

  /**
   * Applies the update operation to the given document.
   * @returns The resultant document.
   * @throws SidetreeError if invalid operation is given.
   */
  public static async applyUpdateOperation (operation: UpdateOperation, document: any): Promise<any> {
    const resultantDocument = DocumentComposer.applyPatches(document, operation.delta!.patches);

    return resultantDocument;
  }

  /**
   * Validates the schema of the given full document state.
   * @throws SidetreeError if given document patch fails validation.
   */
  private static validateDocument (document: any) {
    if (document === undefined) {
      throw new SidetreeError(ErrorCode.DocumentComposerDocumentMissing);
    }

    const allowedProperties = new Set(['publicKeys', 'services']);
    for (const property in document) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.DocumentComposerUnknownPropertyInDocument, `Unexpected property ${property} in document.`);
      }
    }

    // Verify 'publicKeys' property if it exists.
    if (('publicKeys' in document)) {
      DocumentComposer.validatePublicKeys(document.publicKeys);
    }

    // Verify 'services' property if it exists.
    if (('services' in document)) {
      // Verify each entry in services array.
      DocumentComposer.validateServices(document.services);
    }
  }

  /**
   * Validates the schema of the given update document patch.
   * @throws SidetreeError if given document patch fails validation.
   */
  public static validateDocumentPatches (patches: any) {
    if (!Array.isArray(patches)) {
      throw new SidetreeError(ErrorCode.DocumentComposerUpdateOperationDocumentPatchesNotArray);
    }

    for (const patch of patches) {
      DocumentComposer.validatePatch(patch);
    }
  }

  private static validatePatch (patch: any) {
    const action = patch.action;
    switch (action) {
      case 'replace':
        DocumentComposer.validateDocument(patch.document);
        break;
      case 'add-public-keys':
        DocumentComposer.validateAddPublicKeysPatch(patch);
        break;
      case 'remove-public-keys':
        DocumentComposer.validateRemovePublicKeysPatch(patch);
        break;
      case 'add-services':
        DocumentComposer.validateAddServicesPatch(patch);
        break;
      case 'remove-services':
        DocumentComposer.validateRemoveServicesPatch(patch);
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
    for (const publicKey of publicKeys) {
      const publicKeyProperties = Object.keys(publicKey);
      // the expected fields are id, purposes, type and publicKeyJwk
      if (publicKeyProperties.length !== 4) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyMissingOrUnknownProperty);
      }

      if (typeof publicKey.publicKeyJwk !== 'object' || Array.isArray(publicKey.publicKeyJwk)) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyJwkMissingOrIncorrectType);
      }

      if (typeof publicKey.type !== 'string') {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyTypeMissingOrIncorrectType);
      }

      DocumentComposer.validateId(publicKey.id);

      // 'id' must be unique
      if (publicKeyIdSet.has(publicKey.id)) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyIdDuplicated);
      }
      publicKeyIdSet.add(publicKey.id);

      if (!Array.isArray(publicKey.purposes) || publicKey.purposes.length === 0) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyPurposeMissingOrUnknown);
      }

      if (ArrayMethods.hasDuplicates(publicKey.purposes)) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyPurposeDuplicated);
      }

      const validPurposes = new Set(Object.values(PublicKeyPurpose));
      // Purpose must be one of the valid ones in PublicKeyPurpose
      for (const purpose of publicKey.purposes) {
        if (!validPurposes.has(purpose)) {
          throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyInvalidPurpose);
        }
      }
    }
  }

  private static validateRemovePublicKeysPatch (patch: any) {
    const allowedProperties = new Set(['action', 'ids']);
    for (const property in patch) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.DocumentComposerUnknownPropertyInRemovePublicKeysPatch,
          `Unexpected property ${property} in remove-public-keys patch.`);
      }
    }

    if (!Array.isArray(patch.ids)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdsNotArray);
    }

    for (const id of patch.ids) {
      DocumentComposer.validateId(id);
    }
  }

  /**
   * validate update patch for removing services
   */
  private static validateRemoveServicesPatch (patch: any) {
    const allowedProperties = new Set(['action', 'ids']);
    for (const property in patch) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.DocumentComposerUnknownPropertyInRemoveServicesPatch, `Unexpected property ${property} in remove-services patch.`);
      }
    }

    if (!Array.isArray(patch.ids)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceIdsNotArray);
    }

    for (const id of patch.ids) {
      DocumentComposer.validateId(id);
    }
  }

  /**
   * Validates update patch for adding services.
   */
  private static validateAddServicesPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
    }

    if (!Array.isArray(patch.services)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchServicesNotArray);
    }

    DocumentComposer.validateServices(patch.services);
  }

  /**
   * Validates and parses services.
   * @param services The services to validate and parse.
   */
  private static validateServices (services: any) {
    if (!Array.isArray(services)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchServicesNotArray);
    }

    for (const service of services) {
      const serviceProperties = Object.keys(service);
      if (serviceProperties.length !== 3) { // type, id, and serviceEndpoint
        throw new SidetreeError(ErrorCode.DocumentComposerServiceHasMissingOrUnknownProperty);
      }

      DocumentComposer.validateId(service.id);

      if (typeof service.type !== 'string') {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceTypeNotString);
      }

      if (service.type.length > 30) {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceTypeTooLong);
      }

      // `serviceEndpoint` validations.
      const serviceEndpoint = service.serviceEndpoint;
      if (typeof serviceEndpoint === 'string') {
        const uri = URI.parse(service.serviceEndpoint);
        if (uri.error !== undefined) {
          throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointStringNotValidUri, `Service endpoint string '${serviceEndpoint}' is not a valid URI.`);
        }
      } else if (typeof serviceEndpoint === 'object') {
        // Allow `object` type only if it is not an array.
        if (Array.isArray(serviceEndpoint)) {
          throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointCannotBeAnArray);
        }
      } else {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointMustBeStringOrNonArrayObject);
      }
    }
  }

  private static validateId (id: any) {
    if (typeof id !== 'string') {
      throw new SidetreeError(ErrorCode.DocumentComposerIdNotString, `ID not string: ${JSON.stringify(id)} is of type '${typeof id}'`);
    }
    if (id.length > 50) {
      throw new SidetreeError(ErrorCode.DocumentComposerIdTooLong);
    }

    if (!Encoder.isBase64UrlString(id)) {
      throw new SidetreeError(ErrorCode.DocumentComposerIdNotUsingBase64UrlCharacterSet);
    }
  }

  /**
   * Applies the given patches in order to the given document.
   * NOTE: Assumes no schema validation is needed, since validation should've already occurred at the time of the operation being parsed.
   * @returns The resultant document.
   */
  public static applyPatches (document: any, patches: any[]): any {
    // Loop through and apply all patches.
    let resultantDocument = document;
    for (const patch of patches) {
      resultantDocument = DocumentComposer.applyPatchToDidDocument(resultantDocument, patch);
    }

    return resultantDocument;
  }

  /**
   * Applies the given patch to the given DID Document.
   */
  private static applyPatchToDidDocument (document: DocumentModel, patch: any): any {
    if (patch.action === 'replace') {
      return patch.document;
    } else if (patch.action === 'add-public-keys') {
      return DocumentComposer.addPublicKeys(document, patch);
    } else if (patch.action === 'remove-public-keys') {
      return DocumentComposer.removePublicKeys(document, patch);
    } else if (patch.action === 'add-services') {
      return DocumentComposer.addServices(document, patch);
    } else if (patch.action === 'remove-services') {
      return DocumentComposer.removeServices(document, patch);
    }
  }

  /**
   * Adds public keys to document.
   */
  private static addPublicKeys (document: DocumentModel, patch: any): DocumentModel {
    const publicKeyMap = new Map((document.publicKeys || []).map(publicKey => [publicKey.id, publicKey]));

    // Loop through all given public keys and add them.
    // NOTE: If a key ID already exists, we will just replace the existing key.
    // Not throwing error will minimize the need (thus risk) of reusing exposed update reveal value.
    for (const publicKey of patch.publicKeys) {
      publicKeyMap.set(publicKey.id, publicKey);
    }

    document.publicKeys = [...publicKeyMap.values()];

    return document;
  }

  /**
   * Removes public keys from document.
   */
  private static removePublicKeys (document: DocumentModel, patch: any): DocumentModel {
    if (document.publicKeys === undefined) {
      return document;
    }

    const idsOfKeysToRemove = new Set(patch.ids);

    // Keep only keys that are not in the removal list.
    document.publicKeys = document.publicKeys.filter(publicKey => !idsOfKeysToRemove.has(publicKey.id));

    return document;
  }

  private static addServices (document: DocumentModel, patch: any): DocumentModel {
    const services = patch.services;

    if (document.services === undefined) {
      // create a new array if `services` does not exist
      document.services = [];
    }

    const idToIndexMapper = new Map();
    // map all id and their index
    for (const index in document.services) {
      idToIndexMapper.set(document.services[index].id, index);
    }

    for (const service of services) {
      if (idToIndexMapper.has(service.id)) {
        const idx = idToIndexMapper.get(service.id);
        document.services[idx] = service;
      } else {
        document.services.push(service);
      }
    }

    return document;
  }

  private static removeServices (document: DocumentModel, patch: any): DocumentModel {
    if (document.services === undefined) {
      return document;
    }

    const idsToRemove = new Set(patch.ids);
    document.services = document.services.filter(service => !idsToRemove.has(service.id));

    return document;
  }
}
