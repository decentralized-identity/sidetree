import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as RequestHandler from './RequestHandler';
import * as Router from 'koa-router';
import { config, ConfigKey } from './Config';
import { toHttpStatus, Response } from './Response';

const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router();
router.post('/', (ctx, _next) => {
  const response = RequestHandler.handleWriteRequest(ctx.body);
  setKoaResponse(response, ctx.response);
});

router.get('/:did', (ctx, _next) => {
  const response = RequestHandler.handleResolveRequest(ctx.params.did);
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
  koaResponse.set('Content-Type', 'application/json');
  koaResponse.body = response.body;
};
