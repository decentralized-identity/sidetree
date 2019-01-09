import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import RequestHandler from './RequestHandler';
import { toHttpStatus, Response } from './Response';
import { Config, ConfigKey } from './Config';
import TransactionNumber from './TransactionNumber';
import * as querystring from 'querystring';

const configFile = require('../json/config.json');
const config = new Config(configFile);

const uri = config[ConfigKey.BitcoreSidetreeServiceUri];
const prefix = config[ConfigKey.SidetreeTransactionPrefix];

const genesisTransactionNumber = TransactionNumber.construct(Number(config[ConfigKey.BitcoinSidetreeGenesisBlockNumber]), 0);
const genesisTimeHash = config[ConfigKey.BitcoinSidetreeGenesisBlockHash];

const requestHandler = new RequestHandler(uri, prefix, genesisTransactionNumber, genesisTimeHash);
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
    const response = await requestHandler.handleFetchRequest(since, transactionTimeHash);
    setKoaResponse(response, ctx.response);
  } else {
    const response = await requestHandler.handleFetchRequest();
    setKoaResponse(response, ctx.response);
  }
});

router.post('/transactions', async (ctx, _next) => {
  const response = await requestHandler.handleAnchorRequest(ctx.body.anchorFileHash);
  setKoaResponse(response, ctx.response);
});

router.post('/transactions/trace', async (ctx, _next) => {
  const response = await requestHandler.handleTraceRequest(JSON.stringify(ctx.body.transactions));
  setKoaResponse(response, ctx.response);
});

router.get('/time', async (ctx, _next) => {
  const response = await requestHandler.handleLastBlockRequest();
  setKoaResponse(response, ctx.response);
});

router.get('/time/:hash', async (ctx, _next) => {
  const response = await requestHandler.handleBlockByHashRequest(ctx.params.hash);
  setKoaResponse(response, ctx.response);
});

app.use(router.routes())
  .use(router.allowedMethods());

// Handler to return bad request for all unhandled paths.
app.use((ctx, _next) => {
  ctx.response.status = 400;
});
const port = 3009;

app.listen(port, () => {
  console.log(`Sidetree-Bitcoin node running on port: ${port}`);
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
  koaResponse.body = response.body;
};
