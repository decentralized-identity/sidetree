import BitcoinClient from '../BitcoinClient';
import BitcoinError from '../BitcoinError';
import BitcoinOutputModel from '../models/BitcoinOutputModel';
import BlockchainLockModel from '../../common/models/BlockchainLockModel';
import ErrorCode from '../ErrorCode';
import LockIdentifierModel from '../models/LockIdentifierModel';
import LockIdentifierSerializer from './LockIdentifierSerializer';
import { Script } from 'bitcore-lib';

/** Structure (internal for this class) to hold the redeem script verification results */
interface LockScriptVerifyResult {
  isScriptValid: boolean;
  owner: string | undefined;
  unlockAtBlock: number | undefined;
}

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
  public async resolveLockIdentifierAndThrowOnError (lockIdentifier: LockIdentifierModel): Promise<BlockchainLockModel> {

    // The verifictation of a lock-identifier has the following steps:
    //   (A). The redeem script in the lock-identifier is actually a 'locking' script
    //   (B). The transaction in the lock-identifier is paying to the redeem script in the lock-identifier
    //
    // With above, we can verify that the amount is/was locked for the specified wallet in
    // the specified transaction.

    // (A). verify redeem script is a lock script
    const redeemScriptObj = LockResolver.createScript(lockIdentifier.redeemScriptAsHex);
    const scriptVerifyResult = LockResolver.isRedeemScriptALockScript(redeemScriptObj);

    if (!scriptVerifyResult.isScriptValid) {
      throw new BitcoinError(ErrorCode.LockResolverRedeemScriptIsNotLock, `${redeemScriptObj.toASM()}`);
    }

    // (B). verify that the transaction is paying to the target redeem script
    const lockTransaction = await this.bitcoinClient.getRawTransaction(lockIdentifier.transactionId);

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
      lockEndTransactionTime: scriptVerifyResult.unlockAtBlock!,
      owner: scriptVerifyResult.owner!
    };
  }

  /**
   * Checks whether the redeem script is indeed a lock script.
   * @param redeemScript The script to check.
   * @returns A touple where [0] = true and [1] = lock-until-block if the script is a lock script; [0] = false and [1] = 0 otherwise.
   */
  private static isRedeemScriptALockScript (redeemScript: Script): LockScriptVerifyResult {

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

    let unlockAtBlock: number | undefined;
    let owner: string | undefined;

    if (isScriptValid) {
      const unlockAtBlockBuffer = Buffer.from(scriptAsmParts[0], 'hex');
      unlockAtBlock = unlockAtBlockBuffer.readIntLE(0, unlockAtBlockBuffer.length);

      owner = scriptAsmParts[5];
    }

    return {
      isScriptValid: isScriptValid,
      owner: owner,
      unlockAtBlock: unlockAtBlock
    };
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

  private static createScript (redeemScriptAsHex: string): Script {

    try {
      const redeemScriptAsBuffer = Buffer.from(redeemScriptAsHex, 'hex');

      return new Script(redeemScriptAsBuffer);
    } catch (e) {
      throw BitcoinError.createFromError(ErrorCode.LockResolverRedeemScriptIsInvalid, e);
    }
  }
}
