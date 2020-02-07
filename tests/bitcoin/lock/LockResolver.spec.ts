import BitcoinClient from '../../../lib/bitcoin/BitcoinClient';
import BitcoinOutputModel from '../../../lib/bitcoin/models/BitcoinOutputModel';
import BitcoinTransactionModel from '../../../lib/bitcoin/models/BitcoinTransactionModel';
import BlockchainLockModel from '../../../lib/common/models/BlockchainLockModel';
import ErrorCode from '../../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';
import LockIdentifier from '../../../lib/bitcoin/models/LockIdentifierModel';
import LockIdentifierSerializer from '../../../lib/bitcoin/lock/LockIdentifierSerializer';
import LockResolver from '../../../lib/bitcoin/lock/LockResolver';
import { Address, Networks, PrivateKey, Script } from 'bitcore-lib';

function createValidLockRedeemScript (lockUntilBlock: number, targetWalletAddress: Address): Script {
  const lockUntilBlockBuffer = Buffer.alloc(3);
  lockUntilBlockBuffer.writeIntLE(lockUntilBlock, 0, 3);

  return Script.empty()
               .add(lockUntilBlockBuffer)
               .add(177) // OP_CLTV
               .add(117) // OP_DROP
               .add(Script.buildPublicKeyHashOut(targetWalletAddress));
}

describe('LockResolver', () => {

  let validTestPrivateKey = new PrivateKey(undefined, Networks.testnet);
  let validTestWalletAddress = validTestPrivateKey.toAddress();
  let validTestAddressAsBuffer = (validTestWalletAddress as any).toBuffer();
  let validTestWalletImportString = validTestPrivateKey.toWIF();

  let lockResolver: LockResolver;

  beforeEach(() => {
    let bitcoinClient = new BitcoinClient('uri:test', 'u', 'p', validTestWalletImportString, 10, 1);
    lockResolver = new LockResolver(bitcoinClient);
  });

  describe('resolveLockIdentifierAndThrowOnError', () => {
    it('should correctly resolve a valid lock identifier.', async () => {
      const lockBlockInput = 1665191;
      const validScript = createValidLockRedeemScript(lockBlockInput, validTestWalletAddress);

      const mockLockIdentifier: LockIdentifier = {
        transactionId: 'some transactoin id',
        redeemScriptAsHex: validScript.toHex(),
        walletAddressAsBuffer: validTestAddressAsBuffer
      };

      const mockTransaction: BitcoinTransactionModel = {
        id: 'some transaction id',
        inputs: [],
        outputs: [
          { satoshis: 10000, scriptAsmAsString: 'mock script asm' }
        ]
      };

      const getTxnSpy = spyOn(lockResolver['bitcoinClient'], 'getRawTransaction').and.returnValue(Promise.resolve(mockTransaction));
      const createScriptSpy = spyOn(LockResolver as any, 'createScriptFromHexInput').and.returnValue(validScript);
      const checkLockScriptSpy = spyOn(LockResolver as any, 'isRedeemScriptALockScript').and.returnValue([true, lockBlockInput]);
      const payToWalletSpy = spyOn(LockResolver as any, 'isRedeemScriptPayingToTargetWallet').and.returnValue(true);
      const payToScriptSpy = spyOn(LockResolver as any, 'isOutputPayingToTargetScript').and.returnValue(true);

      const mockSerializedLockIdentifier = 'mocked-locked-identifier';
      spyOn(LockIdentifierSerializer, 'serialize').and.returnValue(mockSerializedLockIdentifier);

      const expectedOutput: BlockchainLockModel = {
        identifier: mockSerializedLockIdentifier,
        amountLocked: mockTransaction.outputs[0].satoshis,
        lockEndTransactionTime: lockBlockInput,
        linkedWalletAddress: validTestWalletAddress.toString()
      };

      const actual = await lockResolver.resolveLockIdentifierAndThrowOnError(mockLockIdentifier);
      expect(expectedOutput).toEqual(actual);

      expect(getTxnSpy).toHaveBeenCalledWith(mockLockIdentifier.transactionId);
      expect(createScriptSpy).toHaveBeenCalledWith(mockLockIdentifier.redeemScriptAsHex);
      expect(checkLockScriptSpy).toHaveBeenCalled();
      expect(payToWalletSpy).toHaveBeenCalledWith(validScript, validTestWalletAddress);
      expect(payToScriptSpy).toHaveBeenCalledWith(mockTransaction.outputs[0], validScript);
    });

    it('should throw if redeem script is not a lock script.', async () => {

      const mockLockIdentifier: LockIdentifier = {
        transactionId: 'some transactoin id',
        redeemScriptAsHex: 'some mock script as hex',
        walletAddressAsBuffer: validTestAddressAsBuffer
      };

      const getTxnSpy = spyOn(lockResolver['bitcoinClient'], 'getRawTransaction');
      spyOn(LockResolver as any, 'createScriptFromHexInput').and.returnValue(Script.empty());
      spyOn(LockResolver as any, 'isRedeemScriptALockScript').and.returnValue([false, 0]);

      await JasmineSidetreeErrorValidator.expectBitcoinErrorToBeThrownAsync(
        () => lockResolver.resolveLockIdentifierAndThrowOnError(mockLockIdentifier),
        ErrorCode.LockResolverRedeemScriptIsNotLock
      );

      expect(getTxnSpy).not.toHaveBeenCalled();
    });

    it('should throw if redeem script is not paying to the target wallet.', async () => {

      const mockLockIdentifier: LockIdentifier = {
        transactionId: 'some transactoin id',
        redeemScriptAsHex: 'validScript to - Hex',
        walletAddressAsBuffer: validTestAddressAsBuffer
      };

      const getTxnSpy = spyOn(lockResolver['bitcoinClient'], 'getRawTransaction');
      spyOn(LockResolver as any, 'createScriptFromHexInput').and.returnValue(Script.empty());
      spyOn(LockResolver as any, 'isRedeemScriptALockScript').and.returnValue([true, 8765]);
      spyOn(LockResolver as any, 'isRedeemScriptPayingToTargetWallet').and.returnValue(false);

      await JasmineSidetreeErrorValidator.expectBitcoinErrorToBeThrownAsync(
        () => lockResolver.resolveLockIdentifierAndThrowOnError(mockLockIdentifier),
        ErrorCode.LockResolverRedeemScriptIsNotPayingToWallet
      );

      expect(getTxnSpy).not.toHaveBeenCalled();
    });

    it('should throw if the transaction output is not paying to the linked wallet.', async () => {

      const mockLockIdentifier: LockIdentifier = {
        transactionId: 'some transactoin id',
        redeemScriptAsHex: 'validScript to - Hex',
        walletAddressAsBuffer: validTestAddressAsBuffer
      };

      const mockTransaction: BitcoinTransactionModel = {
        id: 'some transaction id',
        inputs: [],
        outputs: [
          { satoshis: 10000, scriptAsmAsString: 'mock script asm' }
        ]
      };

      spyOn(lockResolver['bitcoinClient'], 'getRawTransaction').and.returnValue(Promise.resolve(mockTransaction));
      spyOn(LockResolver as any, 'createScriptFromHexInput').and.returnValue(Script.empty());
      spyOn(LockResolver as any, 'isRedeemScriptALockScript').and.returnValue([true, 8765]);
      spyOn(LockResolver as any, 'isRedeemScriptPayingToTargetWallet').and.returnValue(true);
      spyOn(LockResolver as any, 'isOutputPayingToTargetScript').and.returnValue(false);

      await JasmineSidetreeErrorValidator.expectBitcoinErrorToBeThrownAsync(
        () => lockResolver.resolveLockIdentifierAndThrowOnError(mockLockIdentifier),
        ErrorCode.LockResolverTransactionIsNotPayingToScript
      );
    });
  });

  describe('isRedeemScriptALockScript', () => {
    it('should validate and return the correct block if the script is valid.', async () => {

      const lockBlockInput = 1665191;
      const validScript = createValidLockRedeemScript(lockBlockInput, validTestWalletAddress);

      const [isValid, outputBlock] = LockResolver['isRedeemScriptALockScript'](validScript);
      expect(isValid).toBeTruthy();
      expect(outputBlock).toEqual(lockBlockInput);
    });

    it('should return false and 0 for block height if the script is invalid', async () => {
      const validScript = createValidLockRedeemScript(1234, validTestWalletAddress);
      const invalidScript = validScript.add(114); // add an invalid op code

      const [isValid, outputBlock] = LockResolver['isRedeemScriptALockScript'](invalidScript);
      expect(isValid).toBeFalsy();
      expect(outputBlock).toEqual(0);
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

  describe('isRedeemScriptPayingToTargetWallet', () => {
    it('should return true if the script is paying to the target wallet.', async () => {
      const validScript = createValidLockRedeemScript(4758759, validTestWalletAddress);

      const result = LockResolver['isRedeemScriptPayingToTargetWallet'](validScript, validTestWalletAddress);
      expect(result).toBeTruthy();
    });

    it('should return false for any other address.', async () => {
      const validScript = createValidLockRedeemScript(198076, validTestWalletAddress);
      const someOtherWallet = new PrivateKey(undefined, Networks.testnet).toAddress();

      const result = LockResolver['isRedeemScriptPayingToTargetWallet'](validScript, someOtherWallet);
      expect(result).toBeFalsy();
    });
  });

  describe('createScriptFromHexInput', () => {
    it('should return script from the hex.', async () => {

      const validScript = createValidLockRedeemScript(12345, validTestWalletAddress);
      validScript.add(114);

      const actual = LockResolver['createScriptFromHexInput'](validScript.toHex());
      expect(actual.toASM()).toEqual(validScript.toASM());
    });

    it('should throw if script creation throws.', async () => {
      spyOn(Buffer,'from').and.throwError('som error');

      JasmineSidetreeErrorValidator.expectBitcoinErrorToBeThrown(
        () => LockResolver['createScriptFromHexInput']('some input'),
        ErrorCode.LockResolverRedeemScriptIsInvalid);
    });
  });

});
