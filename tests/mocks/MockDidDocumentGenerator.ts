import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { WriteOperation } from '../../src/Operation';

/**
 * Implementation of Did document update - no-op for testing purposes.
 */
export function didDocumentUpdate (didDoc: DidDocument, _operation: WriteOperation): DidDocument {
  return didDoc;
}

export const didDocumentJson = {
  '@context': 'https://w3id.org/did/v1',
  'id': 'did:sidetree:ignored',
  'publicKey': [{
    'id': 'did:sidetree:didPortionIgnored#key-1',
    'type': 'RsaVerificationKey2018',
    'owner': 'did:sidetree:ignoredUnlessResolvable',
    'publicKeyPem': '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n'
  }],
  'service': [{
    'type': 'IdentityHub',
    'publicKey': 'did:sidetree:ignored#key-1',
    'serviceEndpoint': {
      '@context': 'schema.identity.foundation/hub',
      '@type': 'UserServiceEndpoint',
      'instances': ['did:bar:456', 'did:zaz:789']
    }
  }]
};

/**
 * Implementation of Did document create - return a dummy did document.
 */
export function didDocumentCreate (_operation: WriteOperation): DidDocument {
  return new DidDocument(didDocumentJson);
}
