import Monitor from '../../lib/bitcoin/Monitor';

describe('BitcoinFileReader', () => {
  let monitor: Monitor;
  beforeAll(() => {
    const mockBitcoinClient = { getBalanceInSatoshis: () => {} };
    monitor = new Monitor(mockBitcoinClient as any);
  });

  describe('getWalletBalance', async () => {
    it('should get wallet balance', async () => {
      const mockBalance = 123;
      spyOn(monitor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(mockBalance));

      const balance = await monitor.getWalletBalance();
      expect(balance).toEqual({ walletBalanceInBtc: 0.00000123 });
    });
  });
});
