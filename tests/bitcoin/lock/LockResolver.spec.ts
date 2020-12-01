import { Address, Networks, PrivateKey, Script, crypto } from 'bitcore-lib';
import BitcoinClient from '../../../lib/bitcoin/BitcoinClient';
import BitcoinOutputModel from '../../../lib/bitcoin/models/BitcoinOutputModel';
import BitcoinTransactionModel from '../../../lib/bitcoin/models/BitcoinTransactionModel';
import BlockMetadata from '../../../lib/bitcoin/models/BlockMetadata';
import BlockMetadataWithoutNormalizedFee from '../../../lib/bitcoin/models/BlockMetadataWithoutNormalizedFee';
import ErrorCode from '../../../lib/bitcoin/ErrorCode';
import { IBlockInfo } from '../../../lib/bitcoin/BitcoinProcessor';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';
import LockIdentifierModel from '../../../lib/bitcoin/models/LockIdentifierModel';
import LockIdentifierSerializer from '../../../lib/bitcoin/lock/LockIdentifierSerializer';
import LockResolver from '../../../lib/bitcoin/lock/LockResolver';
import MockBlockMetadataStore from '../../mocks/MockBlockMetadataStore';
import ValueTimeLockModel from '../../../lib/common/models/ValueTimeLockModel';
import VersionManager from '../../../lib/bitcoin/VersionManager';
import VersionModel from '../../../lib/bitcoin/models/BitcoinVersionModel';

function createValidLockRedeemScript (lockDurationInBlocks: number, targetWalletAddress: Address): Script {
  const lockDurationInBlocksBuffer = Buffer.alloc(3);
  lockDurationInBlocksBuffer.writeIntLE(lockDurationInBlocks, 0, 3);

  return Script.empty()
    .add(lockDurationInBlocksBuffer)
    .add(178) // OP_CSV
    .add(117) // OP_DROP
    .add(Script.buildPublicKeyHashOut(targetWalletAddress));
}

function createLockScriptVerifyResult (isScriptValid: boolean, owner: string | undefined, lockDurationInBlocks: number | undefined): any {
  return {
    isScriptValid: isScriptValid,
    publicKeyHash: owner,
    lockDurationInBlocks: lockDurationInBlocks
  };
}

describe('LockResolver', () => {
  const versionModels: VersionModel[] = [{ startingBlockchainTime: 0, version: 'latest', protocolParameters: { valueTimeLockDurationInBlocks: 5, initialNormalizedFeeInSatoshis: 1, feeLookBackWindowInBlocks: 1, feeMaxFluctuationMultiplierPerBlock: 1 } }];
  const versionManager = new VersionManager();
  versionManager.initialize(versionModels, { genesisBlockNumber: 0 } as any, new MockBlockMetadataStore());

  const validTestPrivateKey = new PrivateKey(undefined, Networks.testnet);
  const validTestWalletAddress = validTestPrivateKey.toAddress();

  const validTestPublicKey = validTestPrivateKey.toPublicKey();
  const validPublicKeyHashOutBuffer = crypto.Hash.sha256ripemd160(validTestPublicKey.toBuffer());
  const validPublicKeyHashOutString = validPublicKeyHashOutBuffer.toString('hex');

  const validTestWalletImportString = validTestPrivateKey.toWIF();

  let lockResolver: LockResolver;

  beforeEach(() => {
    const bitcoinClient = new BitcoinClient('uri:test', 'u', 'p', validTestWalletImportString, 10, 1, 0);
    lockResolver = new LockResolver(versionManager, bitcoinClient);
  });

  describe('resolveSerializedLockIdentifierAndThrowOnError', () => {
    it('should deserialize the identifier and call the other function', async (done) => {

      const mockLockIdentifier: LockIdentifierModel = {
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id'
      };
      const deserializeSpy = spyOn(LockIdentifierSerializer, 'deserialize').and.returnValue(mockLockIdentifier);

      const mockLockStartBlock = 12345;
      spyOn(lockResolver as any, 'calculateLockStartingBlock').and.returnValue(Promise.resolve(12345));

      const mockValueTimeLock: ValueTimeLockModel = {
        amountLocked: 1000,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 1900,
        normalizedFee: 100,
        lockTransactionTime: mockLockStartBlock
      };
      const resolveSpy = spyOn(lockResolver, 'resolveLockIdentifierAndThrowOnError').and.returnValue(Promise.resolve(mockValueTimeLock));

      const serializedIdInput = 'mock serialized identifier';
      const actual = await lockResolver.resolveSerializedLockIdentifierAndThrowOnError(serializedIdInput);

      expect(actual).toEqual(mockValueTimeLock);
      expect(deserializeSpy).toHaveBeenCalledWith(serializedIdInput);
      expect(resolveSpy).toHaveBeenCalled();
      done();
    });
  });

  describe('resolveLockIdentifierAndThrowOnError', () => {
    it('should correctly resolve a valid lock identifier.', async () => {
      const lockDurationInput = 166;
      const validScript = createValidLockRedeemScript(lockDurationInput, validTestWalletAddress);

      const mockLockIdentifier: LockIdentifierModel = {
        transactionId: 'some transactoin id',
        redeemScriptAsHex: validScript.toHex()
      };

      const mockTransaction: BitcoinTransactionModel = {
        id: 'some transaction id',
        blockHash: 'block hash',
        confirmations: 5,
        inputs: [],
        outputs: [
          { satoshis: 10000, scriptAsmAsString: 'mock script asm' }
        ]
      };

      const mockLockScriptVerifyResult = createLockScriptVerifyResult(true, validPublicKeyHashOutString, lockDurationInput);

      const getTxnSpy = spyOn(lockResolver as any, 'getTransaction').and.returnValue(Promise.resolve(mockTransaction));
      const createScriptSpy = spyOn(LockResolver as any, 'createScript').and.returnValue(validScript);
      const checkLockScriptSpy = spyOn(LockResolver as any, 'isRedeemScriptALockScript').and.returnValue(mockLockScriptVerifyResult);
      const payToScriptSpy = spyOn(LockResolver as any, 'isOutputPayingToTargetScript').and.returnValue(true);

      const mockSerializedLockIdentifier = 'mocked-locked-identifier';
      spyOn(LockIdentifierSerializer, 'serialize').and.returnValue(mockSerializedLockIdentifier);

      const mockLockStartBlock = 12345;
      spyOn(lockResolver as any, 'calculateLockStartingBlock').and.returnValue(Promise.resolve(mockLockStartBlock));

      const mockNormalizedFee = 87654;
      const mockFeeCalculator = {
        calculateNormalizedTransactionFeeFromBlock (block: BlockMetadata) { return Math.floor(block.normalizedFee); },
        async getNormalizedFee () { return mockNormalizedFee; },
        async addNormalizedFeeToBlockMetadata (block: BlockMetadataWithoutNormalizedFee) { return Object.assign({ normalizedFee: mockNormalizedFee }, block); }
      };
      const getFeeCalculatorSpy = spyOn(lockResolver['versionManager'], 'getFeeCalculator').and.returnValue(mockFeeCalculator);
      spyOn(lockResolver['versionManager'], 'getLockDurationInBlocks').and.returnValue(lockDurationInput);

      const expectedUnlockTransactionTime = mockLockStartBlock + lockDurationInput;

      const expectedOutput: ValueTimeLockModel = {
        identifier: mockSerializedLockIdentifier,
        amountLocked: mockTransaction.outputs[0].satoshis,
        lockTransactionTime: mockLockStartBlock,
        unlockTransactionTime: expectedUnlockTransactionTime,
        normalizedFee: mockNormalizedFee,
        owner: validPublicKeyHashOutString
      };

      const actual = await lockResolver.resolveLockIdentifierAndThrowOnError(mockLockIdentifier);
      expect(expectedOutput).toEqual(actual);

      expect(getTxnSpy).toHaveBeenCalledWith(mockLockIdentifier.transactionId);
      expect(createScriptSpy).toHaveBeenCalledWith(mockLockIdentifier.redeemScriptAsHex);
      expect(checkLockScriptSpy).toHaveBeenCalled();
      expect(payToScriptSpy).toHaveBeenCalledWith(mockTransaction.outputs[0], validScript);
      expect(getFeeCalculatorSpy).toHaveBeenCalledWith(mockLockStartBlock);
    });

    it('should throw if redeem script is not a lock script.', async () => {

      const mockLockIdentifier: LockIdentifierModel = {
        transactionId: 'some transactoin id',
        redeemScriptAsHex: 'some mock script as hex'
      };

      const mockLockScriptVerifyResult = createLockScriptVerifyResult(false, undefined, undefined);

      const getTxnSpy = spyOn(lockResolver as any, 'getTransaction');
      spyOn(LockResolver as any, 'createScript').and.returnValue(Script.empty());
      spyOn(LockResolver as any, 'isRedeemScriptALockScript').and.returnValue(mockLockScriptVerifyResult);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockResolver.resolveLockIdentifierAndThrowOnError(mockLockIdentifier),
        ErrorCode.LockResolverRedeemScriptIsNotLock
      );

      expect(getTxnSpy).not.toHaveBeenCalled();
    });

    it('should throw if the transaction output is not paying to the linked wallet.', async () => {

      const mockLockIdentifier: LockIdentifierModel = {
        transactionId: 'some transactoin id',
        redeemScriptAsHex: 'validScript to - Hex'
      };

      const mockTransaction: BitcoinTransactionModel = {
        id: 'some transaction id',
        blockHash: 'block hash',
        confirmations: 5,
        inputs: [],
        outputs: [
          { satoshis: 10000, scriptAsmAsString: 'mock script asm' }
        ]
      };

      const mockLockScriptVerifyResult = createLockScriptVerifyResult(true, validPublicKeyHashOutString, 123);

      spyOn(lockResolver as any, 'getTransaction').and.returnValue(Promise.resolve(mockTransaction));
      spyOn(LockResolver as any, 'createScript').and.returnValue(Script.empty());
      spyOn(LockResolver as any, 'isRedeemScriptALockScript').and.returnValue(mockLockScriptVerifyResult);
      spyOn(LockResolver as any, 'isOutputPayingToTargetScript').and.returnValue(false);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockResolver.resolveLockIdentifierAndThrowOnError(mockLockIdentifier),
        ErrorCode.LockResolverTransactionIsNotPayingToScript
      );
    });

    it('should throw if the lock duration is invalid.', async () => {

      const mockLockIdentifier: LockIdentifierModel = {
        transactionId: 'some transactoin id',
        redeemScriptAsHex: 'validScript to - Hex'
      };

      const mockTransaction: BitcoinTransactionModel = {
        id: 'some transaction id',
        blockHash: 'block hash',
        confirmations: 5,
        inputs: [],
        outputs: [
          { satoshis: 10000, scriptAsmAsString: 'mock script asm' }
        ]
      };

      const mockLockScriptVerifyResult = createLockScriptVerifyResult(true, validPublicKeyHashOutString, 123);

      spyOn(lockResolver as any, 'getTransaction').and.returnValue(Promise.resolve(mockTransaction));
      spyOn(LockResolver as any, 'createScript').and.returnValue(Script.empty());
      spyOn(LockResolver as any, 'isRedeemScriptALockScript').and.returnValue(mockLockScriptVerifyResult);
      spyOn(LockResolver as any, 'isOutputPayingToTargetScript').and.returnValue(true);
      spyOn(lockResolver as any, 'calculateLockStartingBlock').and.returnValue(Promise.resolve(1234));
      spyOn(lockResolver['versionManager'], 'getLockDurationInBlocks').and.returnValue(1);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockResolver.resolveLockIdentifierAndThrowOnError(mockLockIdentifier),
        ErrorCode.LockResolverDurationIsInvalid
      );
    });
  });

  describe('isRedeemScriptALockScript', () => {
    it('should validate and return the correct block if the script is valid.', async () => {

      const lockDurationInput = 424;
      const validScript = createValidLockRedeemScript(lockDurationInput, validTestWalletAddress);

      const expectedOutput = createLockScriptVerifyResult(true, validPublicKeyHashOutString, lockDurationInput);

      const actual = LockResolver['isRedeemScriptALockScript'](validScript);
      expect(actual).toEqual(expectedOutput);
    });

    it('should return false and 0 for block height if the script is invalid', async () => {
      const validScript = createValidLockRedeemScript(1234, validTestWalletAddress);
      const invalidScript = validScript.add(114); // add an invalid op code

      const expectedOutput = createLockScriptVerifyResult(false, undefined, undefined);

      const actual = LockResolver['isRedeemScriptALockScript'](invalidScript);
      expect(actual).toEqual(expectedOutput);
    });
  });

  describe('isOutputPayingToTargetScript', () => {
    it('should return true if the output is paying to the target script.', async () => {
      const validScript = createValidLockRedeemScript(4758759, validTestWalletAddress);
      const validScriptAsPayToScriptHashOut = Script.buildScriptHashOut(validScript);

      const mockOutput: BitcoinOutputModel = {
        satoshis: 1000, scriptAsmAsString: validScriptAsPayToScriptHashOut.toASM()
      };

      const result = LockResolver['isOutputPayingToTargetScript'](mockOutput, validScript);
      expect(result).toBeTruthy();
    });

    it('should return false for any other script.', async () => {
      const validScript = createValidLockRedeemScript(4758759, validTestWalletAddress);
      const validScript2 = createValidLockRedeemScript(987654, validTestWalletAddress);

      const mockOutput: BitcoinOutputModel = {
        satoshis: 1000, scriptAsmAsString: validScript2.toASM()
      };
      const result = LockResolver['isOutputPayingToTargetScript'](mockOutput, validScript);
      expect(result).toBeFalsy();
    });
  });

  describe('createScript', () => {
    it('should return script from the hex.', async () => {

      const validScript = createValidLockRedeemScript(12345, validTestWalletAddress);
      validScript.add(114);

      const actual = LockResolver['createScript'](validScript.toHex());
      expect(actual.toASM()).toEqual(validScript.toASM());
    });

    it('should throw if script creation throws.', async () => {
      spyOn(Buffer, 'from').and.throwError('som error');

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => LockResolver['createScript']('some input'),
        ErrorCode.LockResolverRedeemScriptIsInvalid);
    });
  });

  describe('getTransaction', () => {
    it('should return true if the bitcoin client returns the transaction', async () => {
      const mockTxn: BitcoinTransactionModel = { id: 'id', blockHash: 'block hash', confirmations: 5, inputs: [], outputs: [] };
      spyOn(lockResolver['bitcoinClient'], 'getRawTransaction').and.returnValue(Promise.resolve(mockTxn));

      const actual = await lockResolver['getTransaction']('input id');
      expect(actual).toBeTruthy();
    });

    it('should throw not-found error if there is an exception thrown by the bitcoin client', async () => {
      spyOn(lockResolver['bitcoinClient'], 'getRawTransaction').and.throwError('not found custom error.');

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockResolver['getTransaction']('input id'),
        ErrorCode.LockResolverTransactionNotFound);
    });
  });

  describe('calculateLockStartingBlock', () => {
    it('should calculate the correct starting block', async (done) => {
      const mockTransaction: BitcoinTransactionModel = {
        id: 'some id',
        blockHash: 'block hash',
        confirmations: 23,
        inputs: [],
        outputs: []
      };

      const mockBlockInfo: IBlockInfo = {
        hash: 'some hash',
        height: 989347,
        previousHash: 'previous hash'
      };
      spyOn(lockResolver['bitcoinClient'], 'getBlockInfo').and.returnValue(Promise.resolve(mockBlockInfo));

      const actual = await lockResolver['calculateLockStartingBlock'](mockTransaction);
      expect(actual).toEqual(mockBlockInfo.height);
      done();
    });

    it('should throw if the number of confirmations on the input is < 0', async (done) => {
      const mockTransaction: BitcoinTransactionModel = {
        id: 'some id',
        blockHash: 'block hash',
        confirmations: -2,
        inputs: [],
        outputs: []
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockResolver['calculateLockStartingBlock'](mockTransaction),
        ErrorCode.LockResolverTransactionNotConfirmed);

      done();
    });

    it('should throw if the number of confirmations on the input is 0', async (done) => {
      const mockTransaction: BitcoinTransactionModel = {
        id: 'some id',
        blockHash: 'block hash',
        confirmations: 0,
        inputs: [],
        outputs: []
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockResolver['calculateLockStartingBlock'](mockTransaction),
        ErrorCode.LockResolverTransactionNotConfirmed);

      done();
    });
  });
});
