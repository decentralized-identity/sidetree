import { readFileSync } from 'fs';
import { WriteOperation } from '../src/Operation';

describe('WriteOperation', () => {  

  it('should throw error if unknown property is found when parsing request.', async () => {
    const createRequest = JSON.parse(readFileSync('./tests/requests/create.json').toString());
    createRequest.dummyProperty = '123';
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { WriteOperation.create(requestWithUnknownProperty) }).toThrowError();
  });

  it('should throw error if more than one type of payload is found when parsing request.', async () => {
    const createRequest = JSON.parse(readFileSync('./tests/requests/create.json').toString());
    createRequest.updatePayload = '123';
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { WriteOperation.create(requestWithUnknownProperty) }).toThrowError();
  });

  it('should throw error if signature is not found when parsing request.', async () => {
    const createRequest = JSON.parse(readFileSync('./tests/requests/create.json').toString());
    delete createRequest.signature;
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { WriteOperation.create(requestWithUnknownProperty) }).toThrowError();
  });
});
