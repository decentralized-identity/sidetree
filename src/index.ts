import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import Core from './Core';
import { Config, ConfigKey } from './Config';
import { initializeProtocol } from './Protocol';
import { IResponse, Response } from './Response';

initializeProtocol('protocol.json');
const configFile = require('../json/config.json');
const config = new Config(configFile);

const sidetreeCore = new Core(config);
const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router();
router.post('/', async (ctx, _next) => {
  const response = await sidetreeCore.requestHandler.handleOperationRequest(ctx.body);
  setKoaResponse(response, ctx.response);
});

router.get('/:didOrDidDocument', async (ctx, _next) => {
  const response = await sidetreeCore.requestHandler.handleResolveRequest(ctx.params.didOrDidDocument);
  setKoaResponse(response, ctx.response);
});

app.use(router.routes())
   .use(router.allowedMethods());

// Handler to return bad request for all unhandled paths.
app.use((ctx, _next) => {
  ctx.response.status = 400;
});

sidetreeCore.initialize()
.then(() => {
  const port = config[ConfigKey.Port];
  app.listen(port, () => {
    console.log(`Sidetree node running on port: ${port}`);
  });
})
.catch((e) => {
  console.log(`Sidetree node initialization failed with error ${e}`);
});

/**
 * Sets the koa response according to the Sidetree response object given.
 */
const setKoaResponse = (response: IResponse, koaResponse: Koa.Response) => {
  koaResponse.status = Response.toHttpStatus(response.status);

  if (response.body) {
    koaResponse.set('Content-Type', 'application/json');
    koaResponse.body = response.body;
  } else {
    // Need to set the body explicitly to empty string, else koa will echo the request as the response.
    koaResponse.body = '';
  }
};

// Creating aliases to classes and interfaces used for external consumption.
// tslint:disable-next-line:no-duplicate-imports - Showing intent of external aliasing independently and explicitly.
import SidetreeCore from './Core';
// tslint:disable-next-line:no-duplicate-imports - Showing intent of external aliasing independently and explicitly.
import {
  IResponse as ISidetreeResponse,
  Response as SidetreeResponse
} from './Response';

export {
  ISidetreeResponse,
  SidetreeCore,
  SidetreeResponse
};
