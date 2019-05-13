import { IBitcoinConfig } from '../../lib/bitcoin/IBitcoinConfig';
import { BitcoinProcessor } from '../../lib';
import TransactionNumber from '../../lib/bitcoin/TransactionNumber';

function randomString (length: number = 16): string {
  return Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(16).substring(0, length);
}

function randomNumber (max: number = 256): number {
  return Math.round(Math.random() * max);
}

describe('BitcoinProcessor', () => {
  describe('constructor', () => {
    it('should use appropriate config values', () => {
      const config: IBitcoinConfig = {
        bitcoinExtensionUri: randomString(),
        bitcoinFee: randomNumber(),
        bitcoinWalletImportString: randomString(),
        databaseName: randomString(),
        genesisBlockHash: randomString(),
        genesisBlockNumber: randomNumber(),
        maxSidetreeTransactions: randomNumber(),
        mongoDbConnectionString: randomString(),
        sidetreeTransactionPrefix: randomString(4)
      };

      const bitcoinProcessor = new BitcoinProcessor(config);
      expect(bitcoinProcessor.bitcoinExtensionUri).toEqual(config.bitcoinExtensionUri);
      expect(bitcoinProcessor.bitcoinFee).toEqual(config.bitcoinFee);
      expect(bitcoinProcessor.defaultTimeout).toEqual(300);
      expect(bitcoinProcessor.genesisTimeHash).toEqual(config.genesisBlockHash);
      expect(TransactionNumber.getBlockNumber(bitcoinProcessor.genesisTransactionNumber)).toEqual(config.genesisBlockNumber);
      expect(bitcoinProcessor.lowBalanceNoticeDays).toEqual(28);
      expect(bitcoinProcessor.maxRetries).toEqual(3);
      expect(bitcoinProcessor.pageSize).toEqual(config.maxSidetreeTransactions);
      expect(bitcoinProcessor.pollPeriod).toEqual(60);
      expect(bitcoinProcessor.sidetreePrefix).toEqual(config.sidetreeTransactionPrefix);
      expect(bitcoinProcessor['transactionStore'].databaseName).toEqual(config.databaseName!);
      expect(bitcoinProcessor['transactionStore']['serverUrl']).toEqual(config.mongoDbConnectionString);
    });
  });

  describe('initialize', () => {
    it('should initialize the transactionStore', async () => {
      
    });

    it('should process all the blocks since its last known', async () => {

    });

    it('should begin to periodically poll for updates', async () => {

    });
  });

  describe('generatePrivateKey', () => {
    it('should construct a PrivateKey and export its WIF', () => {

    });
  });

  describe('time', () => {
    it('should get the current latest when given no hash', async () => {

    });

    it('should get the corresponding bitcoin height given a hash', async () => {

    });
  });

  describe('transactions', () => {
    it('should get transactions since genesis limited by page size', async () => {

    });

    it('should get transactions since a specific block height and hash', async () => {

    });

    it('should fail if only given a block height', async () => {

    });

    it('should fail if the height and hash do not validate against the current blockchain', async () => {

    });

    it('should handle moreTransactions parameter according to the returned page size', async () => {

    });
  });

  describe('firstValidTransaction', () => {
    it('should return the first of the valid transactions when given transactions out of order', async () => {

    });
    it('should return undefined if no valid transactions are found', async () => {

    });
  });

  describe('writeTransaction', () => {
    it('should write a transaction if there are enough Satoshis', async () => {

    });

    it('should warn if the number of Satoshis are under the lowBalance calculation', async () => {

    });

    it('should fail if there are not enough satoshis to create a transaction', async () => {

    });
  });

  describe('getUnspentCoins', () => {
    it('should query for unspent output coins given an address', async () => {

    });

    it('should throw if the request failed', async () => {

    });

    it('should return empty if no coins were found', async () => {

    });
  });

  describe('broadcastTransaction', () => {
    it('should serialize and broadcast a transaction', async () => {

    });

    it('should throw if the request failed', async () => {

    });

    it('should return false if the broadcast failed', async () => {

    });
  });

  describe('periodicPoll', () => {
    it('should call processTransactions from its last known point', async () => {

    });

    it('should set a timeout to call itself', async () => {

    });
  });

  describe('processTransactions', () => {
    it('should verify the start block', async () => {

    });

    it('should begin a rollback if the start block failed to validate', async () => {

    });

    it('should call processBlock on all blocks within range', async () => {

    });

    it('should use the current tip if no end is specified', async () => {

    });
  });

  describe('revertBlockchainCache', () => {
    it('should exponentially revert transactions', async () => {

    });

    it('should continue to revert if the first exponential revert failed', async () => {

    });
  });

  describe('getTip', () => {
    it('should return the latest block', async () => {

    });
  });

  describe('verifyBlock', () => {
    it('should return true if the hash matches given a block height', async () => {

    });

    it('should return false if the hash does not match given a block height', async () => {

    });
  });

  describe('processBlock', () => {
    it('should review all transactions in a block and add them to the transactionStore', async () => {

    });

    it('should ignore other data transactions', async () => {

    });
  });

  describe('rpcCall', () => {
    it('should make a request and return the result', async () => {

    });
    it('should throw if the request failed', async () => {

    });
    it('should throw if the RPC call failed', async () => {

    });
  });

  describe('fetchWithRetry', () => {
    it('should fetch the URI with the given requestParameters', async () => {

    });
    it('should retry with an extended time period if the request timed out', async () => {

    });
    it('should stop retrying after the max retry limit', async () => {

    });
    it('should throw non timeout errors immediately', async () => {

    });
  });

  describe('waitFor', () => {
    it('should return after the given amount of time', async () => {

    });
  });
});
