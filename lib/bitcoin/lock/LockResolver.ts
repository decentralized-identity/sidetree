import BitcoinClient from '../BitcoinClient';
import BitcoinError from '../BitcoinError';
import BitcoinOutputModel from '../models/BitcoinOutputModel';
import BitcoinTransactionModel from '../models/BitcoinTransactionModel';
import BlockchainLockModel from '../../common/models/BlockchainLockModel';
import ErrorCode from '../ErrorCode';
import LockIdentifier from '../models/LockIdentifierModel';
import LockIdentifierSerializer from './LockIdentifierSerializer';
import { Address, Script } from 'bitcore-lib';

/**
 * Encapsulates functionality for verifying a bitcoin lock created by this service.
 */
export default class LockResolver {

  constructor (private bitcoinClient: BitcoinClient) {
  }

  /**
   * Gets the corresponding lock information represented by the specified lock identifier. it also verifies
   * the lock by making sure that the corresponding transaction is indeed a lock transaction paying to the
   * wallet in the lockIdentifier upon lock expiry.
   *
   * @param lockIdentifier The lock identifier.
   * @returns The blockchain lock model if the specified identifier is verified; throws if verification fails.
   */
  public async resolveLockIdentifierAndThrowOnError (lockIdentifier: LockIdentifier): Promise<BlockchainLockModel> {

    // The verifictation of a lock-identifier has the following steps:
    //   (A). The redeem script in the lock-identifier is actually a 'locking' script
    //   (B). The redeem script in the lock-identifier is paying to the wallet in the lock-identifier
    //   (C). The transaction in the lock-identifier is paying to the redeem script in the lock-identifier
    //
    // With above, we can verify that the amount is/was locked for the specified wallet in
    // the specified transaction.

    // (A). verify redeem script is a lock script
    const redeemScriptObj = LockResolver.createScriptFromHexInput(lockIdentifier.redeemScriptAsHex);
    const [isLockScript, lockUntilBlock] = LockResolver.isRedeemScriptALockScript(redeemScriptObj);

    if (!isLockScript) {
      throw new BitcoinError(ErrorCode.LockResolverRedeemScriptIsNotLock, `${redeemScriptObj.toASM()}`);
    }

    // (B). verify that the script is paying to the target wallet
    const walletAddressObj = new Address(lockIdentifier.walletAddressAsBuffer);
    const isLockScriptPayingTargetWallet = LockResolver.isRedeemScriptPayingToTargetWallet(redeemScriptObj, walletAddressObj);

    if (!isLockScriptPayingTargetWallet) {
      throw new BitcoinError(ErrorCode.LockResolverRedeemScriptIsNotPayingToWallet,
                            `Script: ${redeemScriptObj.toASM()}; Wallet: ${walletAddressObj.toString()}`);
    }

    // (C). verify that the transaction is paying to the target redeem script
    const lockTransaction = await this.fetchTransaction(lockIdentifier.transactionId);

    const transactionIsPayingToTargetRedeemScript = lockTransaction.outputs.length > 0 &&
                                                    LockResolver.isOutputPayingToTargetScript(lockTransaction.outputs[0], redeemScriptObj);

    if (!transactionIsPayingToTargetRedeemScript) {
      throw new BitcoinError(ErrorCode.LockResolverTransactionIsNotPayingToScript,
                             `Transaction id: ${lockIdentifier.transactionId} Script: ${redeemScriptObj.toASM()}`);
    }

    // Now that the lock identifier has been verified, return the lock information
    const serializedLockIdentifier = LockIdentifierSerializer.serialize(lockIdentifier);

    return {
      identifier: serializedLockIdentifier,
      amountLocked: lockTransaction.outputs[0].satoshis,
      lockEndTransactionTime: lockUntilBlock,
      linkedWalletAddress: walletAddressObj.toString()
    };
  }

  /**
   * Checks whether the redeem script is indeed a lock script.
   * @param redeemScript The script to check.
   * @returns A touple where [0] == true if the script is a lock script; false otherwise, [1] == if [0] is true then the lockUntilBlock.
   */
  private static isRedeemScriptALockScript (redeemScript: Script): [boolean, number] {

    // Split the script into parts and verify each part
    const scriptAsmParts = redeemScript.toASM().split(' ');

    // Verify different parts
    const isScriptValid =
      scriptAsmParts.length === 8 &&
      scriptAsmParts[1] === 'OP_NOP2' &&
      scriptAsmParts[2] === 'OP_DROP' &&
      scriptAsmParts[3] === 'OP_DUP' &&
      scriptAsmParts[4] === 'OP_HASH160' &&
      scriptAsmParts[6] === 'OP_EQUALVERIFY' &&
      scriptAsmParts[7] === 'OP_CHECKSIG';

    if (isScriptValid) {
      const lockUntilBlockBuffer = Buffer.from(scriptAsmParts[0], 'hex');
      const lockUntilBlock = lockUntilBlockBuffer.readIntLE(0, lockUntilBlockBuffer.length);

      return [isScriptValid, lockUntilBlock];
    }

    return [isScriptValid, 0];
  }

  /**
   * Checks whether the specified output is a "paytoscript" type output to the specified script.
   * @param bitcoinOutput The freeze output from the bitcoin transaction.
   * @param targetScript The expected redeem script.
   */
  private static isOutputPayingToTargetScript (bitcoinOutput: BitcoinOutputModel, targetScript: Script): boolean {
    const targetScriptHashOut = Script.buildScriptHashOut(targetScript);

    return bitcoinOutput.scriptAsmAsString === targetScriptHashOut.toASM();
  }

  /**
   * Checks whether the specified redeem script is paying to the target wallet address.
   * @param redeemScript The redeem script representing a lock script.
   * @param targetWalletAddress The wallet address to be verified.
   */
  private static isRedeemScriptPayingToTargetWallet (redeemScript: Script, targetWalletAddress: Address): boolean {
    // Convert the wallet address into the standard "publickeyhash" bitcoin output
    const publicKeyHashOutput = Script.buildPublicKeyHashOut(targetWalletAddress);
    const publicKeyHashOutputAsHex = publicKeyHashOutput.toHex();

    // If the above output is the suffix in the redeem script then it is paying to the target wallet
    return redeemScript.toHex().endsWith(publicKeyHashOutputAsHex);
  }

  private static createScriptFromHexInput (redeemScriptAsHex: string): Script {
    try {
      const redeemScriptAsBuffer = Buffer.from(redeemScriptAsHex, 'hex');

      return new Script(redeemScriptAsBuffer);
    } catch (e) {
      throw BitcoinError.createFromError(ErrorCode.LockResolverRedeemScriptIsInvalid, e);
    }
  }

  private async fetchTransaction (transactionId: string): Promise<BitcoinTransactionModel> {
    try {
      return this.bitcoinClient.getRawTransaction(transactionId);
    } catch (e) {
      throw BitcoinError.createFromError(ErrorCode.LockResolverTransactionNotFound, e);
    }
  }
}
