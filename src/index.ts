import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as RequestHandler from 'RequestHandler';
import { toHttpStatus, Response } from 'Response';

const app = new Koa();

const router = new Router();

router.get('/:hash', (ctx, _next) => {
  const response = RequestHandler.handleFetchRequest(ctx.params.hash);
  setKoaResponse(response, ctx.response);
});

app.use(router.routes())
   .use(router.allowedMethods());

// Handler to return bad request for all unhandled paths.
app.use((ctx, _next) => {
  ctx.response.status = 400;
});
const port = 3001;

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
