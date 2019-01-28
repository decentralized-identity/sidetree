const server = require('../src/index');
const request = require('supertest');

describe('Sidetree-ipfs integration test', () => {
  let originalTimeout: number;
  beforeAll(async () => {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000;
  });

  afterAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    server.close();
  });

  // TODO: Fix timeout integration test - https://github.com/decentralized-identity/sidetree-ipfs/issues/27
  // it('Should return timeout exception for GET/ if ipfs content not present', async () => {
  //   const response = await request(server).get('/v1.0/EiCpCIUFS-4cXGiFJG_L_w_TN6Hrco1-XFYaJ7vthh3FMA');
  //   expect(response.status).toEqual(404);
  // });
});
