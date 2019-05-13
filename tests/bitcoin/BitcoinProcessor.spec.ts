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
        sidetreeTransactionPrefix: randomString(4),
        lowBalanceNoticeInDays: undefined,
        defaultTimeoutInMilliseconds: undefined,
        maxRetries: undefined,
        transactionPollPeriodInSeconds: undefined
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
      throw new Error('not yet implemented');
    });

    it('should process all the blocks since its last known', async () => {
      throw new Error('not yet implemented');
    });

    it('should begin to periodically poll for updates', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('generatePrivateKey', () => {
    it('should construct a PrivateKey and export its WIF', () => {
      throw new Error('not yet implemented');
    });
  });

  describe('time', () => {
    it('should get the current latest when given no hash', async () => {
      throw new Error('not yet implemented');
    });

    it('should get the corresponding bitcoin height given a hash', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('transactions', () => {
    it('should get transactions since genesis limited by page size', async () => {
      throw new Error('not yet implemented');
    });

    it('should get transactions since a specific block height and hash', async () => {
      throw new Error('not yet implemented');
    });

    it('should fail if only given a block height', async () => {
      throw new Error('not yet implemented');
    });

    it('should fail if the height and hash do not validate against the current blockchain', async () => {
      throw new Error('not yet implemented');
    });

    it('should handle moreTransactions parameter according to the returned page size', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('firstValidTransaction', () => {
    it('should return the first of the valid transactions when given transactions out of order', async () => {
      throw new Error('not yet implemented');
    });
    it('should return undefined if no valid transactions are found', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('writeTransaction', () => {
    it('should write a transaction if there are enough Satoshis', async () => {
      throw new Error('not yet implemented');
    });

    it('should warn if the number of Satoshis are under the lowBalance calculation', async () => {
      throw new Error('not yet implemented');
    });

    it('should fail if there are not enough satoshis to create a transaction', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('getUnspentCoins', () => {
    it('should query for unspent output coins given an address', async () => {
      throw new Error('not yet implemented');
    });

    it('should throw if the request failed', async () => {
      throw new Error('not yet implemented');
    });

    it('should return empty if no coins were found', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('broadcastTransaction', () => {
    it('should serialize and broadcast a transaction', async () => {
      throw new Error('not yet implemented');
    });

    it('should throw if the request failed', async () => {
      throw new Error('not yet implemented');
    });

    it('should return false if the broadcast failed', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('periodicPoll', () => {
    it('should call processTransactions from its last known point', async () => {
      throw new Error('not yet implemented');
    });

    it('should set a timeout to call itself', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('processTransactions', () => {
    it('should verify the start block', async () => {
      throw new Error('not yet implemented');
    });

    it('should begin a rollback if the start block failed to validate', async () => {
      throw new Error('not yet implemented');
    });

    it('should call processBlock on all blocks within range', async () => {
      throw new Error('not yet implemented');
    });

    it('should use the current tip if no end is specified', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('revertBlockchainCache', () => {
    it('should exponentially revert transactions', async () => {
      throw new Error('not yet implemented');
    });

    it('should continue to revert if the first exponential revert failed', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('getTip', () => {
    it('should return the latest block', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('verifyBlock', () => {
    it('should return true if the hash matches given a block height', async () => {
      throw new Error('not yet implemented');
    });

    it('should return false if the hash does not match given a block height', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('processBlock', () => {
    it('should review all transactions in a block and add them to the transactionStore', async () => {
      throw new Error('not yet implemented');
    });

    it('should ignore other data transactions', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('rpcCall', () => {
    it('should make a request and return the result', async () => {
      throw new Error('not yet implemented');
    });
    it('should throw if the request failed', async () => {
      throw new Error('not yet implemented');
    });
    it('should throw if the RPC call failed', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('fetchWithRetry', () => {
    it('should fetch the URI with the given requestParameters', async () => {
      throw new Error('not yet implemented');
    });
    it('should retry with an extended time period if the request timed out', async () => {
      throw new Error('not yet implemented');
    });
    it('should stop retrying after the max retry limit', async () => {
      throw new Error('not yet implemented');
    });
    it('should throw non timeout errors immediately', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('waitFor', () => {
    it('should return after the given amount of time', async () => {
      throw new Error('not yet implemented');
    });
  });
});
