import Cryptography from '../src/lib/Cryptography';
import OperationGenerator from './generators/OperationGenerator';
import { WriteOperation } from '../src/Operation';

describe('WriteOperation', async () => {
  // Load the DID Document template.
  const didDocumentTemplate = require('./json/didDocumentTemplate.json');

  let createRequest: any;

  beforeAll(async () => {
    const [publicKeyJwk, privateKeyJwk] = await Cryptography.generateKeyPair('key1'); // Generate a unique key-pair used for each test.
    const createRequestBuffer = await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKeyJwk, privateKeyJwk);
    createRequest = JSON.parse(createRequestBuffer.toString());
  });

  it('should throw error if unknown property is found when parsing request.', async () => {
    createRequest.dummyProperty = '123';
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { WriteOperation.create(requestWithUnknownProperty); }).toThrowError();
  });

  it('should throw error if more than one type of payload is found when parsing request.', async () => {
    createRequest.updatePayload = '123';
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { WriteOperation.create(requestWithUnknownProperty); }).toThrowError();
  });

  it('should throw error if signature is not found when parsing request.', async () => {
    delete createRequest.signature;
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { WriteOperation.create(requestWithUnknownProperty); }).toThrowError();
  });
});
