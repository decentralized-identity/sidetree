import BitcoinClient from '../BitcoinClient';
import BitcoinOutputModel from '../models/BitcoinOutputModel';
import BlockchainLockModel from '../../common/models/BlockchainLockModel';
import LockIdentifier from './LockIdentifier';
import { crypto, Script, Address } from 'bitcore-lib';

/**
 * Encapsulates functionality for verifying a bitcoin lock created by this service.
 */
export default class LockResolver {

  constructor (private bitcoinClient: BitcoinClient) {
  }

  /**
   * Verifies that the lock identifier represents a lock for the specified wallet address.
   * @param lockIdentifier The lock identifier.
   * @returns The blockchain lock model if the specified identifier is verified.
   */
  public async resolveLockAndThrowOnError (lockIdentifier: LockIdentifier): Promise<BlockchainLockModel> {

    const redeemScriptObj = new Script(lockIdentifier.redeemScript);

    // First perform the verifications which do not require us to fetch the transaction.
    // This way we can quit earlier if there are any errors.
    const [isLockScript, lockUntilBlock] = LockResolver.isRedeemScriptALockScript(redeemScriptObj);

    if (!isLockScript) {
      // THROW
    }

    // Now check to see whether the redeem script is going to pay to the target wallet upon spend
    const walletAddressObj = new Address(lockIdentifier.walletAddress);
    const isLockScriptPayingTargetWallet = LockResolver.isRedeemScriptPayingToTargetWallet(redeemScriptObj, walletAddressObj);

    if (!isLockScriptPayingTargetWallet) {
      // THROW
    }

    // Now fetch the corresponding transaction and make sure that the transaction is actually paying
    // to the redeem script.
    const lockTransaction = await this.bitcoinClient.getRawTransaction(lockIdentifier.transactionId);

    const transactionIsPayingToTargetRedeemScript =
      lockTransaction.outputs.length > 0 &&
      LockResolver.isOutputPayingToTargetScript(lockTransaction.outputs[0], redeemScriptObj);

    if (transactionIsPayingToTargetRedeemScript) {
      // THROW
    }

    // Now that the lock identifier has been verified, return
    return {
      identifier: lockIdentifier.serialize(),
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
      const lockUntilBlockBN = (crypto.BN as any).fromScriptNumberBuffer(lockUntilBlockBuffer);

      const lockUntilBlock = lockUntilBlockBN.toNumber;

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
    const publicKeyHashOutputAsString = publicKeyHashOutput.toASM();

    // If the above output is the suffix in the redeem script then it is paying to the target wallet
    return redeemScript.toASM().endsWith(publicKeyHashOutputAsString);
  }
}
