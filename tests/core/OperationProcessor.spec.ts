import AnchoredOperation from '../../lib/core/versions/latest/AnchoredOperation';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import BatchFile from '../../lib/core/versions/latest/BatchFile';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Document from '../../lib/core/versions/latest/Document';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import Encoder from '../../lib/core/versions/0.4.0/Encoder';
import ICas from '../../lib/core/interfaces/ICas';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import IOperationProcessor from '../../lib/core/interfaces/IOperationProcessor';
import IVersionManager from '../../lib/core/interfaces/IVersionManager';
import Jws from '../../lib/core/versions/latest/util/Jws';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import MockCas from '../mocks/MockCas';
import MockOperationStore from '../mocks/MockOperationStore';
import MockVersionManager from '../mocks/MockVersionManager';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import Resolver from '../../lib/core/Resolver';

/**
 * Creates a batch file with single operation given operation buffer,
 * then adds the batch file to the given CAS.
 * @returns The operation in the batch file added in the form of a Operation.
 */
async function addBatchFileOfOneOperationToCas (
  operationBuffer: Buffer,
  cas: ICas,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number): Promise<AnchoredOperation> {

  const operationBuffers: Buffer[] = [ operationBuffer ];
  const batchBuffer = await BatchFile.fromOperationBuffers(operationBuffers);
  await cas.write(batchBuffer);

  const anchoredOperationModel: AnchoredOperationModel = {
    operationBuffer,
    operationIndex,
    transactionNumber,
    transactionTime
  };

  const anchoredOperation = AnchoredOperation.createAnchoredOperation(anchoredOperationModel);
  return anchoredOperation;
}

async function createUpdateSequence (
  didUniqueSuffix: string,
  createOp: AnchoredOperation,
  cas: ICas,
  numberOfUpdates:
  number,
  privateKey: any): Promise<AnchoredOperation[]> {

  const ops = new Array(createOp);
  const opHashes = new Array(createOp.operationHash);

  for (let i = 0; i < numberOfUpdates; ++i) {
    const mostRecentVersion = opHashes[i];
    const updatePayload = {
      didUniqueSuffix,
      previousOperationHash: mostRecentVersion,
      patches: [
        {
          action: 'remove-service-endpoints',
          serviceType: 'IdentityHub',
          serviceEndpoints: ['did:sidetree:value' + (i - 1)]
        },
        {
          action: 'add-service-endpoints',
          serviceType: 'IdentityHub',
          serviceEndpoints: ['did:sidetree:value' + i]
        }
      ]
    };

    const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, '#key1', privateKey);
    const updateOp = await addBatchFileOfOneOperationToCas(
      updateOperationBuffer,
      cas,
      i + 1,   // transaction Number
      i + 1,   // transactionTime
      0        // operation index
      );
    ops.push(updateOp);

    const updateOpHash = updateOp.operationHash;
    opHashes.push(updateOpHash);
  }

  return ops;
}

function getFactorial (n: number): number {
  let factorial = 1;
  for (let i = 2 ; i <= n ; ++i) {
    factorial *= i;
  }
  return factorial;
}

// Return a permutation of a given size with a specified index among
// all possible permutations. For example, there are 5! = 120 permutations
// of size 5, so by passing index values 0..119 we can enumerate all
// permutations
function getPermutation (size: number, index: number): Array<number> {
  const permutation: Array<number> = [];

  for (let i = 0 ; i < size ; ++i) {
    permutation.push(i);
  }

  for (let i = 0 ; i < size ; ++i) {
    const j = i + Math.floor(index / getFactorial(size - i - 1));
    index = index % getFactorial(size - i - 1);

    const t = permutation[i];
    permutation[i] = permutation[j];
    permutation[j] = t;
  }

  return permutation;
}

function validateDidDocumentAfterUpdates (didDocument: DocumentModel | undefined, numberOfUpdates: number) {
  expect(didDocument).toBeDefined();
  expect(didDocument!.service![0].serviceEndpoint.instance[0]).toEqual('did:sidetree:value' + (numberOfUpdates - 1));
}

describe('OperationProcessor', async () => {
  // Load the DID Document template.
  const didDocumentTemplate = require('../json/didDocumentTemplate.json');

  let cas = new MockCas();
  const config = require('../json/config-test.json');
  let resolver: Resolver;
  let operationStore: IOperationStore;
  let versionManager: IVersionManager;
  let operationProcessor: IOperationProcessor;
  let createOp: AnchoredOperation | undefined;
  let publicKey: any;
  let privateKey: any;
  let didUniqueSuffix: string;

  beforeEach(async () => {
    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery); // Generate a unique key-pair used for each test.

    cas = new MockCas();
    operationStore = new MockOperationStore();
    operationProcessor = new OperationProcessor(config.didMethodName);
    versionManager = new MockVersionManager();
    spyOn(versionManager, 'getOperationProcessor').and.returnValue(operationProcessor);
    resolver = new Resolver(versionManager, operationStore);

    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
    createOp = await addBatchFileOfOneOperationToCas(createOperationBuffer, cas, 0, 0, 0);
    didUniqueSuffix = createOp.didUniqueSuffix;
  });

  it('should return a DID Document for resolve(did) for a registered DID', async () => {
    await operationStore.put([createOp!]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;

    // This is a poor man's version based on public key properties
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument, 'key2');
    expect(publicKey2).toBeDefined();
  });

  it('should ignore a duplicate create operation', async () => {
    await operationStore.put([createOp!]);

    // Create and process a duplicate create op
    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
    const duplicateCreateOp = await addBatchFileOfOneOperationToCas(createOperationBuffer, cas, 1, 1, 0);
    await operationStore.put([duplicateCreateOp]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;

    // This is a poor man's version based on public key properties
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument, 'key2');
    expect(publicKey2).toBeDefined();
  });

  it('should process update to remove a public key correctly', async () => {
    await operationStore.put([createOp!]);

    const updatePayload = {
      didUniqueSuffix,
      previousOperationHash: createOp!.operationHash,
      patches: [
        {
          action: 'remove-public-keys',
          publicKeys: ['#key2']
        }
      ]
    };

    // Generate operation with an invalid key
    const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, '#key1', privateKey);
    const updateOp = await addBatchFileOfOneOperationToCas(updateOperationBuffer, cas, 1, 1, 0);
    await operationStore.put([updateOp]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;

    expect(didDocument).toBeDefined();
    const key2 = Document.getPublicKey(didDocument, '#key2');
    expect(key2).not.toBeDefined(); // if update above went through, new key would be added.
  });

  it('should process updates correctly', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);
    await operationStore.put(ops);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;
    validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);
  });

  it('should correctly process updates in reverse order', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);

    for (let i = numberOfUpdates ; i >= 0 ; --i) {
      await operationStore.put([ops[i]]);
    }
    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;
    validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);
  });

  it('should correctly process updates in every (5! = 120) order', async () => {
    const numberOfUpdates = 4;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);

    const numberOfOps = ops.length;
    let numberOfPermutations = getFactorial(numberOfOps);

    for (let i = 0 ; i < numberOfPermutations; ++i) {
      const permutation = getPermutation(numberOfOps, i);
      operationStore = new MockOperationStore();
      resolver = new Resolver(versionManager, operationStore);
      const permutedOps = permutation.map(i => ops[i]);
      await operationStore.put(permutedOps);
      const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;
      validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);
    }
  });

  it('should not resolve the DID if its create operation failed signature validation.', async () => {
    // Generate a create operation with an invalid signature.
    const [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
    const operation = await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKey, privateKey);
    operation.signature = 'AnInvalidSignature';

    // Create and upload the batch file with the invalid operation.
    const operationBuffer = Buffer.from(JSON.stringify(operation));
    const createOperation = await addBatchFileOfOneOperationToCas(operationBuffer, cas, 1, 0, 0);

    // Trigger processing of the operation.
    await operationStore.put([createOperation]);
    const didUniqueSuffix = createOperation.operationHash;

    // Attempt to resolve the DID and validate the outcome.
    const didDocument = await resolver.resolve(didUniqueSuffix);
    expect(didDocument).toBeUndefined();
  });

  it('should return undefined for deleted did', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);
    await operationStore.put(ops);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;
    validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);

    const deleteOperationBuffer = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, '#key1', privateKey);
    const deleteOperation = await addBatchFileOfOneOperationToCas(deleteOperationBuffer, cas, numberOfUpdates + 1, numberOfUpdates + 1, 0);
    await operationStore.put([deleteOperation]);

    const didDocumentAfterDelete = await resolver.resolve(didUniqueSuffix);
    expect(didDocumentAfterDelete).toBeUndefined();
  });

  it('should not resolve the DID if its create operation contains invalid key id.', async () => {
    // Generate a create operation with an invalid signature.
    const [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
    const operation = await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKey, privateKey);

    // Replace the protected header with invlaid `kid`.
    const protectedHeader = {
      operation: 'create',
      kid: 'InvalidKeyId',
      alg: 'ES256K'
    };
    const protectedHeaderJsonString = JSON.stringify(protectedHeader);
    const protectedHeaderEncodedString = Encoder.encode(protectedHeaderJsonString);
    operation.protected = protectedHeaderEncodedString;

    // Recompute the signature.
    operation.signature = await Jws.sign(protectedHeaderEncodedString, operation.payload, privateKey);

    // Create and upload the batch file with the invalid operation.
    const operationBuffer = Buffer.from(JSON.stringify(operation));
    const createOperation = await addBatchFileOfOneOperationToCas(operationBuffer, cas, 1, 0, 0);

    // Trigger processing of the operation.
    await operationStore.put([createOperation]);
    const didUniqueSuffix = createOperation.operationHash;

    // Attempt to resolve the DID and validate the outcome.
    const didDocument = await resolver.resolve(didUniqueSuffix);
    expect(didDocument).toBeUndefined();
  });

  it('should ignore delete operations of a non-existent did', async () => {
    const deleteOperationBuffer = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, '#key1', privateKey);
    const deleteOperation = await addBatchFileOfOneOperationToCas(deleteOperationBuffer, cas, 1, 1, 0);
    await operationStore.put([deleteOperation]);

    const didDocumentAfterDelete = await resolver.resolve(didUniqueSuffix);
    expect(didDocumentAfterDelete).toBeUndefined();
  });

  it('should ignore delete operations with invalid signing key id', async () => {
    await operationStore.put([createOp!]);

    const deleteOperationBuffer = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, 'InvalidKeyId', privateKey);
    const deleteOperation = await addBatchFileOfOneOperationToCas(deleteOperationBuffer, cas, 1, 1, 0);
    await operationStore.put([deleteOperation]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument, 'key2');
    expect(publicKey2).toBeDefined();
  });

  it('should ignore delete operations with invalid signature', async () => {
    await operationStore.put([createOp!]);

    const deleteOperation = await OperationGenerator.generateDeleteOperation(didUniqueSuffix, '#key1', privateKey);
    deleteOperation.signature = 'InvalidSignature';
    const deleteOperationBuffer = Buffer.from(JSON.stringify(deleteOperation));
    const anchoredDeleteOperation = await addBatchFileOfOneOperationToCas(deleteOperationBuffer, cas, 1, 1, 0);
    await operationStore.put([anchoredDeleteOperation]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument, 'key2');
    expect(publicKey2).toBeDefined();
  });

  it('should ignore updates to did that is not created', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);

    // elide i = 0, the create operation
    for (let i = 1 ; i < ops.length ; ++i) {
      await operationStore.put([ops[i]]);
    }

    const didDocument = await resolver.resolve(didUniqueSuffix);
    expect(didDocument).toBeUndefined();
  });

  it('should ignore update operation signed with an unresolvable key', async () => {
    await operationStore.put([createOp!]);

    const updatePayload = {
      didUniqueSuffix,
      previousOperationHash: createOp!.operationHash,
      patches: [
        {
          action: 'add-public-keys',
          publicKeys: [
            {
              id: '#new-key',
              type: 'Secp256k1VerificationKey2018',
              usage: 'signing',
              publicKeyHex: '0268ccc80007f82d49c2f2ee25a9dae856559330611f0a62356e59ec8cdb566e69'
            }
          ]
        }
      ]
    };

    // Generate operation with an invalid key
    const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, '#UnresolvableKey', privateKey);
    const updateOp = await addBatchFileOfOneOperationToCas(updateOperationBuffer, cas, 1, 1, 0);
    await operationStore.put([updateOp]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;

    expect(didDocument).toBeDefined();
    const newKey = Document.getPublicKey(didDocument, 'new-key');
    expect(newKey).not.toBeDefined(); // if update above went through, new key would be added.
  });

  it('should ignore update operation with an invalid signature', async () => {
    await operationStore.put([createOp!]);

    const updatePayload = {
      didUniqueSuffix,
      previousOperationHash: createOp!.operationHash,
      patches: [
        {
          action: 'add-public-keys',
          publicKeys: [
            {
              id: '#new-key',
              type: 'Secp256k1VerificationKey2018',
              usage: 'signing',
              publicKeyHex: '0268ccc80007f82d49c2f2ee25a9dae856559330611f0a62356e59ec8cdb566e69'
            }
          ]
        }
      ]
    };

    // Generate operation with an invalid key
    const updateOperation = await OperationGenerator.generateUpdateOperation(updatePayload, '#key1', privateKey);
    updateOperation.signature = 'InvalidSignature';
    const updateOperationBuffer = Buffer.from(JSON.stringify(updateOperation));
    const anchoredUpdateOperation = await addBatchFileOfOneOperationToCas(updateOperationBuffer, cas, 1, 1, 0);
    await operationStore.put([anchoredUpdateOperation]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;

    expect(didDocument).toBeDefined();
    const newKey = Document.getPublicKey(didDocument, 'new-key');
    expect(newKey).not.toBeDefined(); // if update above went through, new key would be added.
  });

  it('should pick earlier of two conflicting updates', async () => {
    await operationStore.put([createOp!]);

    const update1Payload = {
      didUniqueSuffix,
      previousOperationHash: createOp!.operationHash,
      patches: [
        {
          action: 'add-public-keys',
          publicKeys: [
            {
              id: '#new-key1',
              type: 'Secp256k1VerificationKey2018',
              usage: 'signing',
              publicKeyHex: '0268ccc80007f82d49c2f2ee25a9dae856559330611f0a62356e59ec8cdb566e69'
            }
          ]
        }
      ]
    };

    const update2Payload = {
      didUniqueSuffix,
      previousOperationHash: createOp!.operationHash,
      patches: [
        {
          action: 'add-public-keys',
          publicKeys: [
            {
              id: '#new-key2',
              type: 'Secp256k1VerificationKey2018',
              usage: 'signing',
              publicKeyHex: '0268ccc80007f82d49c2f2ee25a9dae856559330611f0a62356e59ec8cdb566e69'
            }
          ]
        }
      ]
    };

    const updateOperation2Buffer = await OperationGenerator.generateUpdateOperationBuffer(update2Payload, '#key1', privateKey);
    const updateOperation2 = await addBatchFileOfOneOperationToCas(updateOperation2Buffer, cas, 2, 2, 0);
    await operationStore.put([updateOperation2]);

    const updateOperation1Buffer = await OperationGenerator.generateUpdateOperationBuffer(update1Payload, '#key1', privateKey);
    const updateOperation1 = await addBatchFileOfOneOperationToCas(updateOperation1Buffer, cas, 1, 1, 0);
    await operationStore.put([updateOperation1]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;

    expect(didDocument).toBeDefined();
    expect(didDocument.publicKey.length).toEqual(3);
    expect(didDocument.publicKey[2].id).toEqual('#new-key1');
  });

  it('should rollback all', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);
    await operationStore.put(ops);
    const didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;
    validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);

    // rollback
    await operationStore.delete();
    const didDocumentAfterRollback = await resolver.resolve(didUniqueSuffix);
    expect(didDocumentAfterRollback).toBeUndefined();
  });
});
