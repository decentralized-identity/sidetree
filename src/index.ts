import * as getRawBody from 'raw-body';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import { config, ConfigKey } from './Config';
import { rooter } from './Rooter';

const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const router = new Router();
router.post('*', async (ctx, _next) => {
  // TODO: Implement real request handling logic. For now simply invoke the rooter with dummy data.
  console.log(Date.now() + ` Handling request.`);
  rooter.add(Buffer.from(Date.now().toString()));
});

app.use(router.routes())
   .use(router.allowedMethods());

const port = config[ConfigKey.Port];
app.listen(port, () => {
  console.log(`Sidetree node running on port: ${port}`);
});
