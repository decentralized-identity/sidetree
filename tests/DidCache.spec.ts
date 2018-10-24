import * as Base58 from 'bs58';
import { Cas } from '../src/Cas';
import { DidCache } from '../src/DidCache';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { WriteOperation } from '../src/Operation'

// Implementation of Did document update - no-op for testing purposes
function didDocumentUpdate (didDoc: DidDocument, _operation: WriteOperation): DidDocument {
  return didDoc;
}

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

// Implementation of Did document create - return a dummy did document
function didDocumentCreate (_operation: WriteOperation): DidDocument {
  return new DidDocument(didDocJson);
}


// Implementation of a dummy cas class for testing - a simple hash map
class DummyCas implements Cas {
  bufs: Buffer[] = [];

  public async write (content: Buffer): Promise<string> {
    this.bufs.push(content);
    return (this.bufs.length - 1).toString();
  }

  public async read (address: string): Promise<Buffer> {
    const idx = +address;
    return this.bufs[idx];
  }
}

function createCreateOpBuf(): Buffer {
  const createPayload = Base58.encode(Buffer.from(JSON.stringify(didDocJson)));
  const createOpRequest = {
    createPayload,
    signature: 'signature',
    proofOfWork: 'proof of work'
  };
  return Buffer.from(JSON.stringify(createOpRequest));
}

async function createRootedOp(opBuf: Buffer, cas: Cas): Promise<WriteOperation> {
  const batch: Buffer[] = [ opBuf ];
  const batchBuffer = Buffer.from(JSON.stringify(batch));
  const batchFileAddress = await cas.write(batchBuffer);
  const op = WriteOperation.create(opBuf, 0, 0, batchFileAddress);
  return op;
}

describe('DidCache', () => {

  it('should return non-null url for create op', async () => {
    const dummyCas = new DummyCas();
    const didCache = new DidCache(dummyCas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createRootedOp(createCreateOpBuf(), dummyCas);
    expect(didCache.apply(createOp)).not.toBeNull();
  });

  it('first(did) should be did', async () => {
    const dummyCas = new DummyCas();
    const didCache = new DidCache(dummyCas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createRootedOp(createCreateOpBuf(), dummyCas);
    const createRet = didCache.apply(createOp);
    expect(createRet).not.toBeNull();

    const did = createRet as string;
    const firstVersion = await didCache.first(did);
    expect(firstVersion).toBe(did);
  });

  it('last(did) should be did', async() => {
    const dummyCas = new DummyCas();
    const didCache = new DidCache(dummyCas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createRootedOp(createCreateOpBuf(), dummyCas);
    const createRet = didCache.apply(createOp);
    expect(createRet).not.toBeNull();

    const did = createRet as string;
    expect(didCache.last(did)).toBe(did);
  });

  it('prev(did) should be null', async() => {
    const dummyCas = new DummyCas();
    const didCache = new DidCache(dummyCas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createRootedOp(createCreateOpBuf(), dummyCas);
    const createRet = didCache.apply(createOp);
    expect(createRet).not.toBeNull();

    const did = createRet as string;
    const prev = await didCache.prev(did);
    expect(prev).toBeNull();
  });

  it('should resolve created did', async () => {
    const dummyCas = new DummyCas();
    const didCache = new DidCache(dummyCas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createRootedOp(createCreateOpBuf(), dummyCas);
    const did = didCache.apply(createOp);
    expect(did).not.toBeNull();

    const resolvedDid = await didCache.resolve(did as string);
    // TODO: can we get the raw json from did? if so, we can write a better test.
    expect(resolvedDid).not.toBeNull();
  });
});
