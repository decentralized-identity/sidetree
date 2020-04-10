import Document from './Document';
import DocumentModel from './models/DocumentModel';
import DidState from '../../models/DidState';
import ErrorCode from './ErrorCode';
import Jwk from './util/Jwk';
import PublicKeyModel from './models/PublicKeyModel';
import PublicKeyUsage from '../../enums/PublicKeyUsage';
import SidetreeError from '../../../common/SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * Class that handles the composition of operations into final external-facing document.
 */
export default class DocumentComposer {

  /**
   * Transforms the given DID state into a DID Document.
   */
  public static transformToExternalDocument (didState: DidState, did: string): any {
    // If the DID is deactivated.
    if (didState.nextRecoveryCommitmentHash === undefined) {
      return { status: 'deactivated' };
    }

    const document = didState.document as DocumentModel;

    // Only populate `publicKey` if general usage exists.
    // Only populate `authentication` if auth usage exists.
    const authentication: any[] = [];
    const publicKeys: any[] = [];
    const operationPublicKeys: any[] = [];
    if (Array.isArray(document.publicKeys)) {
      for (let publicKey of document.publicKeys) {
        const id = '#' + publicKey.id;
        const didDocumentPublicKey = {
          id: id,
          controller: '',
          type: publicKey.type,
          publicKeyJwk: publicKey.jwk
        };
        const usageSet: Set<string> = new Set(publicKey.usage);

        if (usageSet.has(PublicKeyUsage.Ops)) {
          operationPublicKeys.push(didDocumentPublicKey);
        }
        if (usageSet.has(PublicKeyUsage.General)) {
          publicKeys.push(didDocumentPublicKey);
          if (usageSet.has(PublicKeyUsage.Auth)) {
            // add into authentication by reference if has auth and has general
            authentication.push(did + id);
          }
        } else if (usageSet.has(PublicKeyUsage.Auth)) {
          // add into authentication by object if has auth but no general
          authentication.push(didDocumentPublicKey);
        }
      }
    }

    // Only update `serviceEndpoints` if the array is present
    let serviceEndpoints;
    if (Array.isArray(document.serviceEndpoints)) {
      serviceEndpoints = [];
      for (let serviceEndpoint of document.serviceEndpoints) {
        const didDocumentServiceEndpoint = {
          id: '#' + serviceEndpoint.id,
          type: serviceEndpoint.type,
          serviceEndpoint: serviceEndpoint.serviceEndpoint
        };

        serviceEndpoints.push(didDocumentServiceEndpoint);
      }
    }

    const didDocument: any = {
      id: did,
      '@context': ['https://www.w3.org/ns/did/v1', { '@base': did }],
      service: serviceEndpoints
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
        operationPublicKeys: operationPublicKeys
      }
    };

    if (didState.recoveryKey) {
      didResolutionResult.methodMetadata.recoveryKey = didState.recoveryKey;
    }

    return didResolutionResult;
  }

  /**
   * Applies the update operation to the given document.
   * @returns The resultant document.
   * @throws SidetreeError if invalid operation is given.
   */
  public static async applyUpdateOperation (operation: UpdateOperation, document: any): Promise<any> {
    // The current document must contain the public key mentioned in the operation ...
    const publicKey = Document.getPublicKey(document, operation.signedData.kid);
    DocumentComposer.validateOperationKey(publicKey);

    // Verify the signature.
    if (!(await operation.signedData.verifySignature(publicKey!.jwk))) {
      throw new SidetreeError(ErrorCode.DocumentComposerInvalidSignature);
    }

    // The operation passes all checks, apply the patches.
    const resultantDocument = DocumentComposer.applyPatches(document, operation.patchData!.patches);

    return resultantDocument;
  }

  /**
   * Validates the schema of the given full document.
   * @throws SidetreeError if given document patch fails validation.
   */
  public static validateDocument (document: any) {
    if (document === undefined) {
      throw new SidetreeError(ErrorCode.DocumentComposerDocumentMissing);
    }

    const allowedProperties = new Set(['publicKeys', 'serviceEndpoints']);
    for (let property in document) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.DocumentComposerUnknownPropertyInDocument, `Unexpected property ${property} in document.`);
      }
    }

    // Verify 'publicKeys' property if it exists.
    if (document.hasOwnProperty('publicKeys')) {
      DocumentComposer.validatePublicKeys(document.publicKeys);
    }

    // Verify 'serviceEndpoints' property if it exists.
    if (document.hasOwnProperty('serviceEndpoints')) {
      // Verify each serviceEndpoint entry in serviceEndpoints.
      DocumentComposer.validateServiceEndpoints(document.serviceEndpoints);
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

    for (let patch of patches) {
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
      case 'add-service-endpoints':
        DocumentComposer.validateAddServiceEndpointsPatch(patch);
        break;
      case 'remove-service-endpoints':
        DocumentComposer.validateRemoveServiceEndpointsPatch(patch);
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
      // the expected fields are id, usage, type and jwk
      if (publicKeyProperties.length !== 4) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyMissingOrUnknownProperty);
      }

      DocumentComposer.validateId(publicKey.id);

      // 'id' must be unique
      if (publicKeyIdSet.has(publicKey.id)) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyIdDuplicated);
      }
      publicKeyIdSet.add(publicKey.id);

      if (!Array.isArray(publicKey.usage) || publicKey.usage.length === 0) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyUsageMissingOrUnknown);
      }

      if (publicKey.usage.length > 3) {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyUsageExceedsMaxLength);
      }

      const validUsages = new Set(Object.values(PublicKeyUsage));
      // usage must be one of the valid ones in PublicKeyUsage
      for (const usage of publicKey.usage) {
        if (!validUsages.has(usage)) {
          throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyInvalidUsage);
        }
      }

      if (publicKey.type === 'Secp256k1VerificationKey2018') {
        // The key must be in JWK format.
        Jwk.validateJwkEs256k(publicKey.jwk);
      } else if (publicKey.type !== 'RsaVerificationKey2018') {
        throw new SidetreeError(ErrorCode.DocumentComposerPublicKeyTypeMissingOrUnknown);
      }
    }
  }

  /**
   * Ensures the given key is an operation key allowed to perform document modification.
   */
  private static validateOperationKey (publicKey: PublicKeyModel | undefined) {
    if (!publicKey) {
      throw new SidetreeError(ErrorCode.DocumentComposerKeyNotFound);
    }

    if (publicKey.type !== 'Secp256k1VerificationKey2018') {
      throw new SidetreeError(ErrorCode.DocumentComposerOperationKeyTypeNotEs256k);
    }

    Jwk.validateJwkEs256k(publicKey.jwk);
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
   * validate update patch for removing service endpoints
   */
  private static validateRemoveServiceEndpointsPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
    }

    if (!Array.isArray(patch.serviceEndpointIds)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointIdsNotArray);
    }

    for (const id of patch.serviceEndpointIds) {
      DocumentComposer.validateId(id);
    }
  }

  /**
   * Validates update patch for adding service endpoints.
   */
  private static validateAddServiceEndpointsPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
    }

    if (!Array.isArray(patch.serviceEndpoints)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointsNotArray);
    }

    DocumentComposer.validateServiceEndpoints(patch.serviceEndpoints);
  }

  private static validateServiceEndpoints (serviceEndpoints: any) {
    if (!Array.isArray(serviceEndpoints)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointsNotArray);
    }

    for (let serviceEndpoint of serviceEndpoints) {
      const serviceEndpointProperties = Object.keys(serviceEndpoint);
      if (serviceEndpointProperties.length !== 3) { // type, id, and serviceEndpoint
        throw new SidetreeError(ErrorCode.DocumentComposerServiceEndpointMissingOrUnknownProperty);
      }

      DocumentComposer.validateId(serviceEndpoint.id);

      if (typeof serviceEndpoint.type !== 'string') {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointTypeNotString);
      }
      if (serviceEndpoint.type.length > 30) {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointTypeTooLong);
      }
      if (typeof serviceEndpoint.serviceEndpoint !== 'string') {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointServiceEndpointNotString);
      }
      if (serviceEndpoint.serviceEndpoint.length > 100) {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointServiceEndpointTooLong);
      }

      try {
        // just want to validate url, no need to assign to variable, it will throw if not valid
        // tslint:disable-next-line
        new URL(serviceEndpoint.serviceEndpoint);
      } catch {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointServiceEndpointNotValidUrl);
      }
    }
  }

  private static validateId (id: any) {
    if (typeof id !== 'string') {
      throw new SidetreeError(ErrorCode.DocumentComposerIdNotString, `ID not string: ${JSON.stringify(id)} is of type '${typeof id}'`);
    }
    if (id.length > 20) {
      throw new SidetreeError(ErrorCode.DocumentComposerIdTooLong);
    }

    if (!DocumentComposer.isBase64UrlString(id)) {
      throw new SidetreeError(ErrorCode.DocumentComposerIdNotUsingBase64UrlCharacterSet);
    }
  }

  private static isBase64UrlString (input: string): boolean {
    // NOTE:
    // '/<expression>/ denotes regex.
    // ^ denotes beginning of string.
    // $ denotes end of string.
    // + denotes one or more characters.
    const isBase64UrlString = /^[A-Za-z0-9_-]+$/.test(input);
    return isBase64UrlString;
  }
  /**
   * Applies the given patches in order to the given document.
   * NOTE: Assumes no schema validation is needed, since validation should've already occurred at the time of the operation being parsed.
   * @returns The resultant document.
   */
  public static applyPatches (document: any, patches: any[]): any {
    // Loop through and apply all patches.
    let resultantDocument = document;
    for (let patch of patches) {
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
    } else if (patch.action === 'add-service-endpoints') {
      return DocumentComposer.addServiceEndpoints(document, patch);
    } else if (patch.action === 'remove-service-endpoints') {
      return DocumentComposer.removeServiceEndpoints(document, patch);
    }
  }

  /**
   * Adds public keys to document.
   */
  private static addPublicKeys (document: DocumentModel, patch: any): DocumentModel {
    const publicKeyMap = new Map(document.publicKeys.map(publicKey => [publicKey.id, publicKey]));

    // Loop through all given public keys and add them if they don't exist already.
    for (let publicKey of patch.publicKeys) {
      // NOTE: If a key ID already exists, we will just replace the existing key.
      // Not throwing error will minimize the need (thus risk) of reusing exposed update reveal value.
      publicKeyMap.set(publicKey.id, publicKey);
    }

    document.publicKeys = [...publicKeyMap.values()];

    return document;
  }

  /**
   * Removes public keys from document.
   */
  private static removePublicKeys (document: DocumentModel, patch: any): DocumentModel {
    const publicKeyMap = new Map(document.publicKeys.map(publicKey => [publicKey.id, publicKey]));

    // Loop through all given public key IDs and delete them from the existing public key only if it is not a recovery key.
    for (let publicKey of patch.publicKeys) {
      const existingKey = publicKeyMap.get(publicKey);

      if (existingKey !== undefined) {
        publicKeyMap.delete(publicKey);
      }
      // NOTE: Else we will just treat this key removal as a no-op.
      // Not throwing error will minimize the need (thus risk) of reusing exposed update reveal value.
    }

    document.publicKeys = [...publicKeyMap.values()];

    return document;
  }

  private static addServiceEndpoints (document: DocumentModel, patch: any): DocumentModel {
    const serviceEndpoints = patch.serviceEndpoints;

    if (document.serviceEndpoints === undefined) {
      // create a new array if service did not exist
      document.serviceEndpoints = [];
    }

    const idToIndexMapper = new Map();
    // map all id and their index
    for (const idx in document.serviceEndpoints) {
      idToIndexMapper.set(document.serviceEndpoints[idx].id, idx);
    }

    for (const serviceEndpoint of serviceEndpoints) {
      if (idToIndexMapper.has(serviceEndpoint.id)) {
        const idx = idToIndexMapper.get(serviceEndpoint.id);
        document.serviceEndpoints[idx] = serviceEndpoint;
      } else {
        document.serviceEndpoints.push(serviceEndpoint);
      }
    }

    return document;
  }

  private static removeServiceEndpoints (document: DocumentModel, patch: any): DocumentModel {
    if (document.serviceEndpoints === undefined) {
      return document;
    }

    const idToRemove = new Set(patch.serviceEndpointIds);
    document.serviceEndpoints = document.serviceEndpoints.filter(serviceEndpoint => !idToRemove.has(serviceEndpoint.id));

    return document;
  }
}
