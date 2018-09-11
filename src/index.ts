import * as getRawBody from 'raw-body';
import * as Koa from 'koa';

const app = new Koa();

// Raw body parser.
app.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Sidetree node running on port: ${port}`);
});
