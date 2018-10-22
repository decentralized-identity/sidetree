import * as Base58 from 'bs58';
import { Cas } from '../src/Cas';
import { DidCache } from '../src/DidCache';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { WriteOperation } from '../src/Operation'

// Implementation of Did document update - no-op for testing purposes
function didDocumentUpdate (didDoc: DidDocument, _operation: WriteOperation): DidDocument {
  return didDoc;
}

// Implementation of Did document create - return a dummy did document
function didDocumentCreate (_operation: WriteOperation): DidDocument {
  const didDocJson = {
    "@context": "https://w3id.org/did/v1",
    "id": "did:sidetree:ignored",
    "publicKey": [{
      "id": "did:sidetree:didPortionIgnored#key-1",
      "type": "RsaVerificationKey2018",
      "owner": "did:sidetree:ignoredUnlessResolvable",
      "publicKeyPem": "-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n"
    }],
    "service": [{
      "type": "IdentityHub",
      "publicKey": "did:sidetree:ignored#key-1",
      "serviceEndpoint": {
        "@context": "schema.identity.foundation/hub",
        "@type": "UserServiceEndpoint",
        "instances": ["did:bar:456", "did:zaz:789"]
      }
    }]
  };

  return new DidDocument(didDocJson);
}

// Implementation of a dummy cas class for testing - a simple hash map
class DummyCas implements Cas {

  public async write (_content: Buffer): Promise<string> {
    return 'dummyString';
  }

  public async read (_address: string): Promise<Buffer> {
    return new Buffer('dummyString');
  }
}

describe('DidCache', () => {
  it('should return non-null url for create op', async () => {
    const createPayload = Base58.encode(Buffer.from('create payload'));
    const createOpRequest = {
      createPayload,
      signature: 'signature',
      proofOfWork: 'proof of work'
    };
    const createOp = WriteOperation.create(Buffer.from(JSON.stringify(createOpRequest)), 0, 0, '1234');
    const dummyCas = new DummyCas();
    const didCache = new DidCache(dummyCas, didDocumentUpdate, didDocumentCreate);
    expect(didCache.apply(createOp)).not.toBeNull();
  });
});