import BitcoinClient from '../../lib/bitcoin/BitcoinClient';
import BitcoinDataGenerator from './BitcoinDataGenerator';
import BitcoinWallet from '../../lib/bitcoin/BitcoinWallet';
import ErrorCode from '../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import { Script } from 'bitcore-lib';

describe('BitcoinWallet', () => {
  let wallet: BitcoinWallet;
  let bitcoinWalletImportString: string;

  beforeAll(() => {
    bitcoinWalletImportString = BitcoinClient.generatePrivateKey('testnet');
  });

  beforeEach(() => {
    wallet = new BitcoinWallet(bitcoinWalletImportString);
  });

  describe('constructor', () => {
    it('should throw if the import wallet string is incorrect', () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => new BitcoinWallet('some invalid string'),
        ErrorCode.BitcoinWalletIncorrectImportString);
    });
  });

  describe('signTransaction', () => {
    it('should call the transaction objects sign function', async (done) => {
      const transaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 10);
      const signSpy = spyOn(transaction, 'sign').and.returnValue(transaction);

      const actual = await wallet.signTransaction(transaction);
      expect(actual).toEqual(transaction);
      expect(signSpy).toHaveBeenCalled();
      done();
    });
  });

  describe('signSpendFromFreezeTransaction', () => {
    it('should sign the transaction correctly.', async (done) => {
      const unspentCoins = BitcoinDataGenerator.generateUnspentCoin(bitcoinWalletImportString, 1000);
      const transaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 10);
      transaction.from([unspentCoins]);

      const redeemScript = Script.empty().add(117).add(177);

      const actual = await wallet.signSpendFromFreezeTransaction(transaction, redeemScript);
      expect(actual).toEqual(transaction);

      // The input script should have 3 parts: signature, public key of the bitcoinClient.privateKey, and redeem script
      const inputScriptAsm = actual.inputs[0].script.toASM();
      const inputScriptAsmParts = inputScriptAsm.split(' ');

      expect(inputScriptAsmParts.length).toEqual(3);
      expect(inputScriptAsmParts[0].length).toBeGreaterThan(0); // Signature
      expect(inputScriptAsmParts[1]).toEqual(wallet['walletPublicKeyAsBuffer'].toString('hex'));
      expect(inputScriptAsmParts[2]).toEqual(redeemScript.toBuffer().toString('hex'));

      done();
    });
  });
});
