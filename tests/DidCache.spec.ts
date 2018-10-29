import * as Base58 from 'bs58';
import BatchFile from '../src/BatchFile';
import MockCas from './mocks/MockCas';
import { Cas } from '../src/Cas';
import { createDidCache } from '../src/DidCache';
import { didDocumentJson } from './mocks/MockDidDocumentGenerator';
import { WriteOperation } from '../src/Operation';

function createCreateOperationBuffer (): Buffer {
  const createPayload = Base58.encode(Buffer.from(JSON.stringify(didDocumentJson)));
  const createOpRequest = {
    createPayload,
    signature: 'signature',
    proofOfWork: 'proof of work'
  };
  return Buffer.from(JSON.stringify(createOpRequest));
}

/**
 * Creates a batch file with single operation given operation buffer,
 * then adds the batch file to the given CAS.
 * @returns The operation in the batch file added in the form of a WriteOperation.
 */
async function addBatchOfOneOperation (opBuf: Buffer, cas: Cas): Promise<WriteOperation> {
  const operations: Buffer[] = [ opBuf ];
  const batchBuffer = BatchFile.fromOperations(operations).toBuffer();
  const batchFileAddress = await cas.write(batchBuffer);
  const op = WriteOperation.create(opBuf, batchFileAddress, 0, 0);
  return op;
}

describe('DidCache', () => {

  it('should return operation hash for create op', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await addBatchOfOneOperation(createCreateOperationBuffer(), cas);
    expect(didCache.apply(createOp)).not.toBeUndefined();
  });

  it('should return firstVersion for first(firstVersion)', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await addBatchOfOneOperation(createCreateOperationBuffer(), cas);
    const firstVersion = didCache.apply(createOp) as string;
    const firstOfFirstVersion = await didCache.first(firstVersion);
    expect(firstOfFirstVersion).toBe(firstVersion);
  });

  it('should return onlyVersion for last(onlyVersion)', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await addBatchOfOneOperation(createCreateOperationBuffer(), cas);
    const onlyVersion = didCache.apply(createOp) as string;
    expect(await didCache.last(onlyVersion)).toBe(onlyVersion);
  });

  it('should return undefined for prev(firstVersion)', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await addBatchOfOneOperation(createCreateOperationBuffer(), cas);
    const firstVersion = didCache.apply(createOp) as string;
    const prev = await didCache.previous(firstVersion);
    expect(prev).toBeUndefined();
  });

  it('should return provided document for resolve(firstVersion)', async () => {
    const cas = new MockCas();
    const didCache = createDidCache(cas);
    const createOp = await addBatchOfOneOperation(createCreateOperationBuffer(), cas);
    const firstVersion = didCache.apply(createOp) as string;
    const resolvedDid = await didCache.resolve(firstVersion);
    // TODO: can we get the raw json from did? if so, we can write a better test.
    expect(resolvedDid).not.toBeUndefined();
  });
});
