import MockBlockchain from '../tests/mocks/MockBlockchain';
import MockCas from '../tests/mocks/MockCas';
import RequestHandler from '../src/RequestHandler';
import Rooter from '../src/Rooter';
import { Config, ConfigKey } from '../src/Config';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { readFileSync } from 'fs';
import { ResponseStatus } from '../src/Response';

describe('RequestHandler', () => {
  // Component dependency initialization & injection.
  const configFile = require('../json/config.json');
  const config = new Config(configFile);
  const blockchain = new MockBlockchain();
  const cas = new MockCas();
  const rooter = new Rooter(blockchain, cas, +config[ConfigKey.BatchIntervalInSeconds]);
  const requestHandler = new RequestHandler(rooter, config[ConfigKey.DidMethodName]);

  it('should handle create operation request.', () => {
    const createRequest = readFileSync('./tests/requests/create.json');
    const response = requestHandler.handleWriteRequest(createRequest);

    // TODO: more validations needed as implementation becomes more complete.
    expect(response).toBeDefined();
    expect(response.status).toEqual(ResponseStatus.Succeeded);
    expect((response.body as DidDocument).id).toEqual('did:sidetree:QmcVuf9R2Ma8PfsBGrJDcvbNGybi7h22c9nM98fBSaLXkF');
  });
});
