/**
 * NOTE: This file is not essential to the Sidetree Core library,
 * this is only an example of how to create and run a Sidetree node.
 */
import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import Core from '../lib/core/Core';
import IConfig from '../lib/core/interfaces/IConfig';
import { IProtocolVersion } from '../lib/core/VersionManager';
import { IResponse, Response } from '../lib/common/Response';

/** Configuration used by this server. */
interface IServerConfig extends IConfig {
  port: number;
}

const config: IServerConfig = require('./core-config.json');
const protocolVersions: IProtocolVersion[] = require('./core-protocol-versioning.json');

const sidetreeCore = new Core(config, protocolVersions);
const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router();
router.post('/', async (ctx, _next) => {
  const response = await sidetreeCore.handleOperationRequest(ctx.body);
  setKoaResponse(response, ctx.response);
});

router.get('/:didOrDidDocument', async (ctx, _next) => {
  const response = await sidetreeCore.handleResolveRequest(ctx.params.didOrDidDocument);
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
  const port = config.port;
  app.listen(port, () => {
    console.log(`Sidetree node running on port: ${port}`);
  });
})
.catch((error: Error) => {
  console.error(`Sidetree node initialization failed with error ${error}`);
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
