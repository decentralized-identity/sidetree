import Cryptography from '../src/lib/Cryptography';
import OperationGenerator from './generators/OperationGenerator';
import { Operation } from '../src/Operation';

describe('Operation', async () => {
  // Load the DID Document template.
  const didDocumentTemplate = require('./json/didDocumentTemplate.json');

  let createRequest: any;

  beforeAll(async () => {
    const [publicKey, privateKey] = await Cryptography.generateKeyPairJwk('key1'); // Generate a unique key-pair used for each test.
    const createRequestBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
    createRequest = JSON.parse(createRequestBuffer.toString());
  });

  it('should throw error if unknown property is found when parsing request.', async () => {
    createRequest.dummyProperty = '123';
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { Operation.create(requestWithUnknownProperty); }).toThrowError();
  });

  it('should throw error if more than one type of payload is found when parsing request.', async () => {
    createRequest.updatePayload = '123';
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { Operation.create(requestWithUnknownProperty); }).toThrowError();
  });

  it('should throw error if signature is not found when parsing request.', async () => {
    delete createRequest.signature;
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { Operation.create(requestWithUnknownProperty); }).toThrowError();
  });
});
