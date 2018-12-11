import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import MockCas from '../tests/mocks/MockCas';
import MockBlockchain from '../tests/mocks/MockBlockchain';
import Observer from './Observer';
import RequestHandler from './RequestHandler';
import Rooter from './Rooter';
// import { BlockchainClient } from './Blockchain';
// import { CasClient } from './Cas';
import { Config, ConfigKey } from './Config';
import { createOperationProcessor } from './OperationProcessor';
import { initializeProtocol } from './Protocol';
import { toHttpStatus, Response } from './Response';

// Component dependency initialization & injection.
initializeProtocol('protocol.json');
const configFile = require('../json/config.json');
const config = new Config(configFile);
// const blockchain = new BlockchainClient(config[ConfigKey.BlockchainNodeUri]);
// const cas = new CasClient(config[ConfigKey.CasNodeUri]);
const blockchain = new MockBlockchain();
const cas = new MockCas();
const operationProcessor = createOperationProcessor(cas, config[ConfigKey.DidMethodName]);
const rooter = new Rooter(blockchain, cas, +config[ConfigKey.BatchIntervalInSeconds]);
const observer = new Observer(blockchain, cas, operationProcessor, +config[ConfigKey.PollingIntervalInSeconds]);
const requestHandler = new RequestHandler(operationProcessor, blockchain, rooter, config[ConfigKey.DidMethodName]);

rooter.startPeriodicRooting();
observer.startPeriodicProcessing();

const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router();
router.post('/', async (ctx, _next) => {
  const response = await requestHandler.handleWriteRequest(ctx.body);
  setKoaResponse(response, ctx.response);
});

router.get('/:did', async (ctx, _next) => {
  const response = await requestHandler.handleResolveRequest(ctx.params.did);
  setKoaResponse(response, ctx.response);
});

app.use(router.routes())
   .use(router.allowedMethods());

// Handler to return bad request for all unhandled paths.
app.use((ctx, _next) => {
  ctx.response.status = 400;
});

const port = config[ConfigKey.Port];
app.listen(port, () => {
  console.log(`Sidetree node running on port: ${port}`);
});

/**
 * Sets the koa response according to the Sidetree response object given.
 */
const setKoaResponse = (response: Response, koaResponse: Koa.Response) => {
  koaResponse.status = toHttpStatus(response.status);

  if (response.body) {
    koaResponse.set('Content-Type', 'application/json');
    koaResponse.body = response.body;
  } else {
    // Need to set the body explicitly to empty string, else koa will echo the request as the response.
    koaResponse.body = '';
  }
};
