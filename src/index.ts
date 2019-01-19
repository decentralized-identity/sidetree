import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import RequestHandler from './RequestHandler';
import { toHttpStatus, Response } from './Response';

// TODO: Move the ipfs configuration to a config file.
let ipfsOptions = {
  repo: 'sidetree-ipfs'
};
const requestHandler = new RequestHandler(ipfsOptions);
const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router({
  prefix: '/v1.0'
});

router.get('/:hash', async (ctx, _next) => {
  const response = await requestHandler.handleFetchRequest(ctx.params.hash);
  setKoaResponse(response, ctx.response, 'application/octet-stream');
});

router.post('/', async (ctx, _next) => {
  const response = await requestHandler.handleWriteRequest(ctx.body);
  setKoaResponse(response, ctx.response);
});

app.use(router.routes())
   .use(router.allowedMethods());

// Handler to return bad request for all unhandled paths.
app.use((ctx, _next) => {
  ctx.response.status = 400;
});
const port = 3001;

const server = app.listen(port, () => {
  console.log(`Sidetree-IPFS node running on port: ${port}`);
})
.on('error', (e) => {
  console.error(`${e.message} on starting Sidetree-IPFS service`);
});

// Listen for graceful termination
process.on('SIGTERM', () => {
  requestHandler.ipfsStorage.node.stop();
});
process.on('SIGINT', () => {
  requestHandler.ipfsStorage.node.stop();
});
process.on('SIGHUP', () => {
  requestHandler.ipfsStorage.node.stop();
});
process.on('uncaughtException', () => {
  requestHandler.ipfsStorage.node.stop();
});

/**
 * Sets the koa response according to the Sidetree response object given.
 * @param response Response object fetched from request handler.
 * @param koaResponse Koa Response object to be filled
 * @param contentType Content type to be set for response, defaults to application/json
 */
const setKoaResponse = (response: Response, koaResponse: Koa.Response, contentType?: string) => {
  koaResponse.status = toHttpStatus(response.status);
  if (contentType) {
    koaResponse.set('Content-Type', contentType);
  } else {
    koaResponse.set('Content-Type', 'application/json');
  }

  if (response.body) {
    koaResponse.body = response.body;
  } else {
    // Need to set the body explicitly, otherwise Koa will return HTTP 204.
    koaResponse.body = '';
  }
};

module.exports = server;
