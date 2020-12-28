import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import PublicKeyModel from '../../lib/core/versions/latest/models/PublicKeyModel';

export default class Document {
  public static getPublicKey (document: DocumentModel, keyId: string): PublicKeyModel | undefined {
    if (Array.isArray(document.publicKeys)) {
      for (let i = 0; i < document.publicKeys.length; i++) {
        const publicKey = document.publicKeys[i];

        if (publicKey.id === keyId) {
          return publicKey;
        }
      }
    }
    return undefined;
  };
}
