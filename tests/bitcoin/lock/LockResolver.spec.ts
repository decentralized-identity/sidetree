import ErrorCode from '../../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';
import LockResolver from '../../../lib/bitcoin/lock/LockResolver';
import { Address, Networks, PrivateKey, Script } from 'bitcore-lib';
import BitcoinOutputModel from '../../../lib/bitcoin/models/BitcoinOutputModel';

function createValidLockRedeemScript (lockUntilBlock: number, targetWalletAddress: Address): Script {
  const lockUntilBlockBuffer = Buffer.alloc(3);
  lockUntilBlockBuffer.writeIntLE(lockUntilBlock, 0, 3);

  return Script.empty()
               .add(lockUntilBlockBuffer)
               .add(177) // OP_CLTV
               .add(117) // OP_DROP
               .add(Script.buildPublicKeyHashOut(targetWalletAddress));
}

fdescribe('LockResolver', () => {

  let validTestPrivateKey = new PrivateKey(undefined, Networks.testnet);
  let validTestWalletAddress = validTestPrivateKey.toAddress();

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
