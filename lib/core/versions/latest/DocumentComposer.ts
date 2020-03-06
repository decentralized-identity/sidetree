import Document from './Document';
import ErrorCode from './ErrorCode';
import InternalDocumentModel from './models/InternalDocumentModel';
import KeyUsage from './KeyUsage';
import Operation from './Operation';
import SidetreeError from '../../SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * Class that handles the composition of operations into final external-facing document.
 * #266 - DidResolutionModel will be gone by the time #266 is done.
 */
export default class DocumentComposer {
  /**
   * Transforms the given internal document model into a DID Document.
   */
  public static transformToExternalDocument (didMethodName: string, internalDocumentModel: InternalDocumentModel): any {
    const did = didMethodName + internalDocumentModel.didUniqueSuffix;
    const didDocument = {
      '@context': 'https://w3id.org/did/v1',
      publicKey: internalDocumentModel.document.publicKey,
      service: internalDocumentModel.document.service,
      recoveryKey: internalDocumentModel.recoveryKey
    };

    Document.addDidToDocument(didDocument, did);

    return didDocument;
  }

  /**
   * Applies the update operation to the given document.
   * @returns The resultant document.
   * @throws SidetreeError if invalid operation is given.
   */
  public static async applyUpdateOperation (operation: UpdateOperation, document: any): Promise<any> {
    // The current document must contain the public key mentioned in the operation ...
    const publicKey = Document.getPublicKey(document, operation.signedOperationDataHash.kid);
    if (!publicKey) {
      throw new SidetreeError(ErrorCode.DocumentComposerKeyNotFound);
    }

    // Verfiy the signature.
    if (!(await operation.signedOperationDataHash.verifySignature(publicKey))) {
      throw new SidetreeError(ErrorCode.DocumentComposerInvalidSignature);
    }

    // The operation passes all checks, apply the patches.
    Operation.applyPatchesToDidDocument(document, operation.operationData.documentPatch);

    return document;
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

    if (!Array.isArray(patch.publicKeys)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeysNotArray);
    }

    for (let publicKey of patch.publicKeys) {
      const publicKeyProperties = Object.keys(publicKey);
      if (publicKeyProperties.length !== 4) {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyMissingOrUnknownProperty);
      }

      if (typeof publicKey.id !== 'string') {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdNotString);
      }

      if (publicKey.usage === KeyUsage.recovery) {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyAddRecoveryKeyNotAllowed);
      }

      if (publicKey.controller !== undefined) {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyControllerNotAllowed);
      }

      if (publicKey.type === 'Secp256k1VerificationKey2018') {
        // The key must be in compressed bitcoin-key format.
        if (typeof publicKey.publicKeyHex !== 'string' ||
            publicKey.publicKeyHex.length !== 66) {
          throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyHexMissingOrIncorrect);
        }
      } else if (publicKey.type !== 'RsaVerificationKey2018') {
        throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyTypeMissingOrUnknown);
      }
    }
  }

  private static validateRemovePublicKeysPatch (patch: any) {
    const patchProperties = Object.keys(patch);
    if (patchProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
    }

    if (!Array.isArray(patch.publicKeys)) {
      throw new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeysNotArray);
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
}
