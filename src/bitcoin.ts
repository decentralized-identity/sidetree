import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as querystring from 'querystring';
import {
  ISidetreeBitcoinConfig,
  SidetreeResponse,
  BitcoinProcessor
} from '../lib/index';

interface IBitcoinServiceConifg extends ISidetreeBitcoinConfig {
  port: number;
}

const config: IBitcoinServiceConifg = require('./bitcoin-config.json');
const blockchainService = new BitcoinProcessor(config);
console.info('Sidetree bitcoin service configuration:');
console.info(config);

const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router();

router.get('/transactions', async (ctx, _next) => {

  const params = querystring.parse(ctx.querystring);
  if ('since' in params && 'transaction-time-hash' in params) {
    const since = Number(params['since']);
    const transactionTimeHash = String(params['transaction-time-hash']);
    const response = await blockchainService.transactions(since, transactionTimeHash);
    setKoaResponse(response, ctx.response);
  } else {
    const response = await blockchainService.transactions();
    setKoaResponse(response, ctx.response);
  }
});

router.post('/transactions', async (ctx, _next) => {
  const response = await blockchainService.writeTransaction(JSON.parse(ctx.body))
  setKoaResponse(response, ctx.response);
});

router.post('/transactions/firstValid', async (ctx, _next) => {
  const response = await blockchainService.firstValidTransaction(JSON.parse(ctx.body));
  setKoaResponse(response, ctx.response);
});

router.get('/time', async (ctx, _next) => {
  const response = await blockchainService.time();
  setKoaResponse(response, ctx.response);
});

router.get('/time/:hash', async (ctx, _next) => {
  const response = await blockchainService.time(ctx.params.hash);
  setKoaResponse(response, ctx.response);
});

app.use(router.routes())
  .use(router.allowedMethods());

// Handler to return bad request for all unhandled paths.
app.use((ctx, _next) => {
  ctx.response.status = 400;
});
const port = config.port;

// initialize the blockchain service and kick-off background tasks
blockchainService.initialize()
  .then(() => {
    app.listen(port, () => {
      console.log(`Sidetree-Bitcoin node running on port: ${port}`);
    });
  })
  .catch((e) => {
    console.log(`Sidetree-Bitcoin node initialization failed with error ${e}`);
  });

/**
 * Sets the koa response according to the Sidetree response object given.
 * @param response Response object fetched from request handler.
 * @param koaResponse Koa Response object to be filled
 * @param contentType Content type to be set for response, defaults to application/json
 */
const setKoaResponse = (response: any, koaResponse: Koa.Response, contentType?: string) => {
  koaResponse.status = SidetreeResponse.toHttpStatus(200);
  if (contentType) {
    koaResponse.set('Content-Type', contentType);
  } else {
    koaResponse.set('Content-Type', 'application/json');
  }
  koaResponse.body = response ? JSON.stringify(response) : '';
};
