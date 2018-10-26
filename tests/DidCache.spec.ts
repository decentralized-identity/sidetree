import * as Base58 from 'bs58';
import MockCas from './mocks/MockCas';
import { Cas } from '../src/Cas';
import { createDidCache } from '../src/DidCache';
import { didDocumentCreate, didDocumentUpdate } from './mocks/MockDidDocumentGenerator';
import { WriteOperation } from '../src/Operation'

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

function createCreateOperationBuffer(): Buffer {
  const createPayload = Base58.encode(Buffer.from(JSON.stringify(didDocJson)));
  const createOpRequest = {
    createPayload,
    signature: 'signature',
    proofOfWork: 'proof of work'
  };
  return Buffer.from(JSON.stringify(createOpRequest));
}

async function createOperationWithSingletonBatch(opBuf: Buffer, cas: Cas): Promise<WriteOperation> {
  const batch: Buffer[] = [ opBuf ];
  const batchBuffer = Buffer.from(JSON.stringify(batch));
  const batchFileAddress = await cas.write(batchBuffer);
  const op = WriteOperation.create(opBuf, batchFileAddress, 0, 0);
  return op;
}

describe('DidCache', () => {

  it('should return non-null url for create op', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    expect(didCache.apply(createOp)).not.toBeNull();
  });

  it('first(did) should be did', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    const createRet = didCache.apply(createOp);
    expect(createRet).not.toBeNull();

    const did = createRet as string;
    const firstVersion = await didCache.first(did);
    expect(firstVersion).toBe(did);
  });

  it('last(did) should be did', async() => {
    const cas = new MockCas();
    const didCache = createDidCache(cas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    const createRet = didCache.apply(createOp);
    expect(createRet).not.toBeNull();

    const did = createRet as string;
    expect(await didCache.last(did)).toBe(did);
  });

  it('prev(did) should be null', async() => {
    const cas = new MockCas();
    const didCache = createDidCache(cas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    const createRet = didCache.apply(createOp);
    expect(createRet).not.toBeNull();

    const did = createRet as string;
    const prev = await didCache.prev(did);
    expect(prev).toBeNull();
  });

  it('should resolve created did', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas, didDocumentUpdate, didDocumentCreate);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    const did = didCache.apply(createOp);
    expect(did).not.toBeNull();

    const resolvedDid = await didCache.resolve(did as string);
    // TODO: can we get the raw json from did? if so, we can write a better test.
    expect(resolvedDid).not.toBeNull();
  });
});
