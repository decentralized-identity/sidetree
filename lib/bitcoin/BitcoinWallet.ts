import { Address, PrivateKey, Script, Transaction } from 'bitcore-lib';
import ErrorCode from './ErrorCode';
import IBitcoinWallet from './interfaces/IBitcoinWallet';
import SidetreeError from '../common/SidetreeError';

/**
 * Represents a bitcoin wallet.
 */
export default class BitcoinWallet implements IBitcoinWallet {

  private readonly walletPrivateKey: PrivateKey;
  private readonly walletAddress: Address;
  private readonly walletPublicKeyAsBuffer: Buffer;
  private readonly walletPublicKeyAsHex: string;

  constructor (bitcoinWalletImportString: string) {
    try {
      this.walletPrivateKey = (PrivateKey as any).fromWIF(bitcoinWalletImportString);
    } catch (error) {
      throw SidetreeError.createFromError(ErrorCode.BitcoinWalletIncorrectImportString, error);
    }

    this.walletAddress = this.walletPrivateKey.toAddress();

    const walletPublicKey = this.walletPrivateKey.toPublicKey();
    this.walletPublicKeyAsBuffer = walletPublicKey.toBuffer();
    this.walletPublicKeyAsHex = this.walletPublicKeyAsBuffer.toString('hex');
  }

  public getPublicKeyAsHex (): string {
    return this.walletPublicKeyAsHex;
  }

  public getAddress (): Address {
    return this.walletAddress;
  }

  public async signTransaction (transaction: Transaction): Promise<Transaction> {
    return transaction.sign(this.walletPrivateKey);
  }

  public async signFreezeTransaction (transaction: Transaction, _outputRedeemScript: Script): Promise<Transaction> {

    // In this implementation of the wallet, we are not using the output-redeem-script parameter for anything. We'll
    // treat the signing of this transaction same as a regular non-freeze transaction.
    return this.signTransaction(transaction);
  }

  public async signSpendFromFreezeTransaction (
    lockTransaction: Transaction,
    inputRedeemScript: Script,
    _outputRedeemScript: Script | undefined): Promise<Transaction> {

    // Create signature
    const signatureType = 0x1; // https://github.com/bitpay/bitcore-lib/blob/44eb5b264b9a28e376cdcf3506160a95cc499533/lib/crypto/signature.js#L308
    const inputIndexToSign = 0;
    const signature = (Transaction as any).sighash.sign(lockTransaction, this.walletPrivateKey, signatureType, inputIndexToSign, inputRedeemScript);

    // Create a script and add it to the input.
    const inputScript = Script.empty()
      .add(signature.toTxFormat())
      .add(this.walletPublicKeyAsBuffer)
      .add(inputRedeemScript.toBuffer());

    (lockTransaction.inputs[0] as any).setScript(inputScript);

    return lockTransaction;
  }
}
