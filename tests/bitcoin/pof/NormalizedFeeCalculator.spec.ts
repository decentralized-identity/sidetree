import BitcoinClient from '../../../lib/bitcoin/BitcoinClient';
import BitcoinDataGenerator from '../BitcoinDataGenerator';
import MockSlidingWindowQuantileStore from '../../mocks/MockSlidingWindowQuantileStore';
import NormalizedFeeCalculator from '../../../lib/bitcoin/fee/NormalizedFeeCalculator';
import ProtocolParameters from '../../../lib/bitcoin/ProtocolParameters';
import SidetreeTransactionParser from '../../../lib/bitcoin/SidetreeTransactionParser';
import TransactionNumber from '../../../lib/bitcoin/TransactionNumber';

function randomString (length: number = 16): string {
  return Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(16).substring(0, length);
}

function randomNumber (max: number = 256): number {
  return Math.round(Math.random() * max);
}

describe('NormalizedFeeCalculaor', () => {
  let normalizedFeeCalculator: NormalizedFeeCalculator;

  beforeEach(() => {
    const validTestWalletImportString = 'cTpKFwqu2HqW4y5ByMkNRKAvkPxEcwpax5Qr33ibYvkp1KSxdji6';
    const bitcoinClient = new BitcoinClient('uri:test', 'u', 'p', validTestWalletImportString, 10, 1, 0);
    const sidetreeTxnParser = new SidetreeTransactionParser(bitcoinClient, 'sidetree');
    const mongoQuantileStore = new MockSlidingWindowQuantileStore();

    normalizedFeeCalculator = new NormalizedFeeCalculator(12345, mongoQuantileStore, bitcoinClient, sidetreeTxnParser);
  });

  describe('initialize', () => {
    it('should initialize members correctly', async (done) => {

      const quantileStoreInitializeSpy = spyOn(normalizedFeeCalculator['quantileCalculator'], 'initialize').and.returnValue(Promise.resolve());
      await normalizedFeeCalculator.initialize();
      expect(quantileStoreInitializeSpy).toHaveBeenCalled();
      done();
    });
  });

  describe('getNormalizedFee', () => {
    it('should return the undefined value returned by the quantile calculator.', async (done) => {
      spyOn(normalizedFeeCalculator['quantileCalculator'], 'getQuantile').and.returnValue(undefined);

      const actual = normalizedFeeCalculator.getNormalizedFee(1234);
      expect(actual).not.toBeDefined();
      done();
    });

    it('should return the value from the quantile calculator.', async (done) => {
      spyOn(normalizedFeeCalculator as any, 'getGroupIdFromBlock').and.returnValue(25);
      const getQuantileSpy = spyOn(normalizedFeeCalculator['quantileCalculator'], 'getQuantile').and.returnValue(509);

      const response = normalizedFeeCalculator.getNormalizedFee(12345);
      expect(response).toEqual(509);
      expect(getQuantileSpy).toHaveBeenCalledWith(25);
      done();
    });
  });

  describe('getFirstTransactionOfGroup', () => {
    it('should return the correct transaction number.', () => {
      const mockBlock = 5000;
      spyOn(normalizedFeeCalculator as any, 'getFirstBlockInGroup').and.returnValue(mockBlock);

      const actual = normalizedFeeCalculator.getFirstTransactionOfGroup(123);
      const expected = TransactionNumber.construct(mockBlock, 0);

      expect(actual).toEqual(expected);
    });
  });

  describe('trimDatabasesToGroupBoundary', () => {
    it('should remove the correct values from the quantile DB.', async (done) => {
      const mockGroupId = 50;
      spyOn(normalizedFeeCalculator as any, 'getGroupIdFromBlock').and.returnValue(mockGroupId);

      const quantileRemoveSpy = spyOn(normalizedFeeCalculator['mongoQuantileStore'], 'removeGroupsGreaterThanEqualTo').and.returnValue(Promise.resolve());
      const txnSamplerSpy = spyOn(normalizedFeeCalculator['transactionSampler'], 'clear').and.returnValue();

      await normalizedFeeCalculator.trimDatabasesToGroupBoundary(12345);
      expect(quantileRemoveSpy).toHaveBeenCalledWith(mockGroupId);
      expect(txnSamplerSpy).toHaveBeenCalled();

      done();
    });
  });

  describe('processBlock', async () => {
    it('should only add the non-sidetree transactions to the sampler.', async (done) => {
      const block = randomNumber();
      const blockData = BitcoinDataGenerator.generateBlock(block, () => {
        return randomString();
      });

      let numOfNonSidetreeTransactions = 0;
      spyOn(normalizedFeeCalculator['sidetreeTransactionParser'], 'parse').and.callFake(() => {

        if (Math.random() > 0.2) {
          return Promise.resolve({ data: randomString(), writer: randomString() });
        }

        numOfNonSidetreeTransactions++;
        return Promise.resolve(undefined);
      });

      const txnSamplerResetSpy = spyOn(normalizedFeeCalculator['transactionSampler'], 'resetPsuedoRandomSeed');
      const txnSamplerAddSpy = spyOn(normalizedFeeCalculator['transactionSampler'], 'addElement').and.returnValue(undefined);

      await normalizedFeeCalculator['processBlock'](blockData);
      expect(txnSamplerAddSpy.calls.count()).toEqual(numOfNonSidetreeTransactions);
      expect(txnSamplerResetSpy).toHaveBeenCalled();
      done();
    });

    it('should add values to the quantile calculator only if we have reached the target group count', async (done) => {
      const block = randomNumber();
      const blockData = BitcoinDataGenerator.generateBlock(block, () => randomString());

      const txnSamplerClearSpy = spyOn(normalizedFeeCalculator['transactionSampler'], 'clear');
      const txnSamplerResetSpy = spyOn(normalizedFeeCalculator['transactionSampler'], 'resetPsuedoRandomSeed');

      const mockedSampleTxns = [ 'abc', '123', '23k', '35d', '4', 'tr', 'afe', '12d', '3rf' ];
      spyOn(normalizedFeeCalculator['transactionSampler'], 'getSample').and.returnValue(mockedSampleTxns);
      spyOn(normalizedFeeCalculator['transactionSampler'], 'addElement').and.returnValue(undefined);
      spyOn(normalizedFeeCalculator, 'isGroupBoundary' as any).and.returnValue(true);

      let mockedTransactionFees = new Array<number>();
      spyOn(normalizedFeeCalculator['bitcoinClient'], 'getTransactionFeeInSatoshis' as any).and.callFake((_id: any) => {
        const fee = randomNumber();
        mockedTransactionFees.push(fee);
        return fee;
      });

      const expectedGroupId = normalizedFeeCalculator['getGroupIdFromBlock'](block);
      const quantileCalculatorAddSpy = spyOn(normalizedFeeCalculator['quantileCalculator'], 'add').and.callFake(async (groupId, fees) => {
        expect(groupId).toEqual(expectedGroupId);
        expect(fees).toEqual(mockedTransactionFees);
      });

      await normalizedFeeCalculator['processBlock'](blockData);
      expect(quantileCalculatorAddSpy).toHaveBeenCalled();
      expect(txnSamplerClearSpy).toHaveBeenCalled();
      expect(txnSamplerResetSpy).toHaveBeenCalled();
      done();
    });
  });

  describe('getFirstBlockInGroup', () => {
    it('should round the value correctly', () => {
      spyOn(normalizedFeeCalculator as any, 'getGroupIdFromBlock').and.returnValue(50);

      const actualRoundDown = normalizedFeeCalculator['getFirstBlockInGroup'](84);
      expect(actualRoundDown).toEqual(50 * ProtocolParameters.groupSizeInBlocks);
    });
  });

  describe('isGroupBoundary', () => {
    it('should return true if is the boundary block', () => {
      const input = ProtocolParameters.groupSizeInBlocks * 3 - 1;
      const actual = normalizedFeeCalculator['isGroupBoundary'](input);
      expect(actual).toBeTruthy();
    });

    it('should return false if is not the boundary block', () => {
      const input = ProtocolParameters.groupSizeInBlocks * 3;
      const actual = normalizedFeeCalculator['isGroupBoundary'](input);
      expect(actual).toBeFalsy();
    });

    it('should return false if is not the boundary block (2)', () => {
      const input = ProtocolParameters.groupSizeInBlocks * 3 - 2;
      const actual = normalizedFeeCalculator['isGroupBoundary'](input);
      expect(actual).toBeFalsy();
    });
  });

  describe('getGroupIdFromBlock', () => {
    it('should return the value correctly', () => {
      const input = 12345;
      const actual = normalizedFeeCalculator['getGroupIdFromBlock'](input);

      const expected = Math.floor(input / ProtocolParameters.groupSizeInBlocks);
      expect(actual).toEqual(expected);
    });
  });
});
