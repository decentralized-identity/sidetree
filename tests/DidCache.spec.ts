import * as Base58 from 'bs58';
import MockCas from './mocks/MockCas';
import { Cas } from '../src/Cas';
import { createDidCache } from '../src/DidCache';
import { WriteOperation } from '../src/Operation';

const didDocJson = {
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

function createCreateOperationBuffer (): Buffer {
  const createPayload = Base58.encode(Buffer.from(JSON.stringify(didDocJson)));
  const createOpRequest = {
    createPayload,
    signature: 'signature',
    proofOfWork: 'proof of work'
  };
  return Buffer.from(JSON.stringify(createOpRequest));
}

async function createOperationWithSingletonBatch (opBuf: Buffer, cas: Cas): Promise<WriteOperation> {
  const batch: Buffer[] = [ opBuf ];
  const batchBuffer = Buffer.from(JSON.stringify(batch));
  const batchFileAddress = await cas.write(batchBuffer);
  const op = WriteOperation.create(opBuf, batchFileAddress, 0, 0);
  return op;
}

describe('DidCache', () => {

  it('should return operation hash for create op', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    expect(didCache.apply(createOp)).not.toBeUndefined();
  });

  it('should return firstVersion for first(firstVersion)', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    const firstVersion = didCache.apply(createOp) as string;
    const firstOfFirstVersion = await didCache.first(firstVersion);
    expect(firstOfFirstVersion).toBe(firstVersion);
  });

  it('should return firstVersion for last(firstVersion)', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    const firstVersion = didCache.apply(createOp) as string;
    expect(await didCache.last(firstVersion)).toBe(firstVersion);
  });

  it('should return undefined for prev(firstVersion)', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    const firstVersion = didCache.apply(createOp) as string;
    const prev = await didCache.prev(firstVersion);
    expect(prev).toBeUndefined();
  });

  it('should return provided document for resolve(firstVersion)', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await createOperationWithSingletonBatch(createCreateOperationBuffer(), cas);
    const firstVersion = didCache.apply(createOp) as string;
    const resolvedDid = await didCache.resolve(firstVersion);
    // TODO: can we get the raw json from did? if so, we can write a better test.
    expect(resolvedDid).not.toBeUndefined();
  });
});
