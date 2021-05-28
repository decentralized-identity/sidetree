import BitcoinClient from '../BitcoinClient';
import BitcoinOutputModel from '../models/BitcoinOutputModel';
import BitcoinTransactionModel from '../models/BitcoinTransactionModel';
import ErrorCode from '../ErrorCode';
import LockIdentifierModel from '../models/LockIdentifierModel';
import LockIdentifierSerializer from './LockIdentifierSerializer';
import Logger from '../../common/Logger';
import { Script } from 'bitcore-lib';
import SidetreeError from '../../common/SidetreeError';
import ValueTimeLockModel from '../../common/models/ValueTimeLockModel';
import VersionManager from '../VersionManager';

/** Structure (internal for this class) to hold the redeem script verification results */
interface LockScriptVerifyResult {
  /** whether or not the script was valid */
  isScriptValid: boolean;
  /** the public key hash of the target address when the script unlocks; undefined if the script is not valid. */
  publicKeyHash: string | undefined;
  /** the duration in blocks for which the lock is valid; undefined if the script is not valid. */
  lockDurationInBlocks: number | undefined;
}

/**
 * Encapsulates functionality for verifying a bitcoin lock created by this service.
 */
export default class LockResolver {

  constructor (
    private versionManager: VersionManager,
    private bitcoinClient: BitcoinClient) {
  }

  /**
   * Gets the corresponding lock information represented by the specified lock identifier.
   * @param serializedLockIdentifier The serialized lock identifier.
   */
  public async resolveSerializedLockIdentifierAndThrowOnError (serializedLockIdentifier: string): Promise<ValueTimeLockModel> {
    const lockIdentifier = LockIdentifierSerializer.deserialize(serializedLockIdentifier);

    return this.resolveLockIdentifierAndThrowOnError(lockIdentifier);
  }

  /**
   * Gets the corresponding lock information represented by the specified lock identifier. It also verifies
   * the lock by making sure that the corresponding transaction is indeed a lock transaction paying to the
   * wallet in the lockIdentifier upon lock expiry.
   *
   * @param lockIdentifier The lock identifier.
   * @returns The blockchain lock model if the specified identifier is verified; throws if verification fails.
   */
  public async resolveLockIdentifierAndThrowOnError (lockIdentifier: LockIdentifierModel): Promise<ValueTimeLockModel> {

    Logger.info(`Starting lock resolution for identifier: ${JSON.stringify(lockIdentifier)}`);

    // The verification of a lock-identifier has the following steps:
    //   (A). The redeem script in the lock-identifier is actually a 'locking' script
    //   (B). The transaction in the lock-identifier is paying to the redeem script in the lock-identifier
    //   (C). The lock duration is valid
    //
    // With above, we can verify that the amount is/was locked for the specified wallet in
    // the specified transaction.

    // (A). verify redeem script is a lock script
    const redeemScriptObj = LockResolver.createScript(lockIdentifier.redeemScriptAsHex);
    const scriptVerifyResult = LockResolver.isRedeemScriptALockScript(redeemScriptObj);

    if (!scriptVerifyResult.isScriptValid) {
      throw new SidetreeError(ErrorCode.LockResolverRedeemScriptIsNotLock, `${redeemScriptObj.toASM()}`);
    }

    // (B). verify that the transaction is paying to the target redeem script
    const lockTransaction = await this.getTransaction(lockIdentifier.transactionId);

    const transactionIsPayingToTargetRedeemScript = lockTransaction.outputs.length > 0 &&
                                                    LockResolver.isOutputPayingToTargetScript(lockTransaction.outputs[0], redeemScriptObj);

    if (!transactionIsPayingToTargetRedeemScript) {
      throw new SidetreeError(ErrorCode.LockResolverTransactionIsNotPayingToScript,
                             `Transaction id: ${lockIdentifier.transactionId} Script: ${redeemScriptObj.toASM()}`);
    }

    // Now that the lock identifier has been verified, return the lock information
    const serializedLockIdentifier = LockIdentifierSerializer.serialize(lockIdentifier);
    const lockStartBlock = await this.calculateLockStartingBlock(lockTransaction);

    // (C). verify that the lock duration is valid
    const unlockAtBlock = lockStartBlock + scriptVerifyResult.lockDurationInBlocks!;

    const lockDurationInBlocks = this.versionManager.getLockDurationInBlocks(lockStartBlock);

    if (this.versionManager.getLockDurationInBlocks(lockStartBlock) !== scriptVerifyResult.lockDurationInBlocks!) {
      throw new SidetreeError(
        ErrorCode.LockResolverDurationIsInvalid,
        // eslint-disable-next-line max-len
        `Lock start block: ${lockStartBlock}. Unlock block: ${unlockAtBlock}. Invalid duration: ${scriptVerifyResult.lockDurationInBlocks!}. Allowed duration: ${lockDurationInBlocks}`
      );
    }

    const normalizedFee = await this.versionManager.getFeeCalculator(lockStartBlock).getNormalizedFee(lockStartBlock);

    return {
      identifier: serializedLockIdentifier,
      amountLocked: lockTransaction.outputs[0].satoshis,
      lockTransactionTime: lockStartBlock,
      unlockTransactionTime: unlockAtBlock,
      normalizedFee: normalizedFee,
      owner: scriptVerifyResult.publicKeyHash!
    };
  }

  /**
   * Checks whether the redeem script is indeed a lock script.
   * @param redeemScript The script to check.
   * @returns The verify result object.
   */
  private static isRedeemScriptALockScript (redeemScript: Script): LockScriptVerifyResult {

    // Split the script into parts and verify each part
    const scriptAsmParts = redeemScript.toASM().split(' ');

    // Verify different parts; [0] & [5] indices are parsed only if the script is valid
    const isScriptValid =
      scriptAsmParts.length === 8 &&
      scriptAsmParts[1] === 'OP_NOP3' &&
      scriptAsmParts[2] === 'OP_DROP' &&
      scriptAsmParts[3] === 'OP_DUP' &&
      scriptAsmParts[4] === 'OP_HASH160' &&
      scriptAsmParts[6] === 'OP_EQUALVERIFY' &&
      scriptAsmParts[7] === 'OP_CHECKSIG';

    let lockDurationInBlocks: number | undefined;
    let publicKeyHash: string | undefined;

    if (isScriptValid) {
      const lockDurationInBlocksBuffer = Buffer.from(scriptAsmParts[0], 'hex');
      lockDurationInBlocks = lockDurationInBlocksBuffer.readIntLE(0, lockDurationInBlocksBuffer.length);

      publicKeyHash = scriptAsmParts[5];
    }

    return {
      isScriptValid: isScriptValid,
      publicKeyHash: publicKeyHash,
      lockDurationInBlocks: lockDurationInBlocks
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
      throw SidetreeError.createFromError(ErrorCode.LockResolverRedeemScriptIsInvalid, e);
    }
  }

  private async getTransaction (transactionId: string): Promise<BitcoinTransactionModel> {
    try {
      return this.bitcoinClient.getRawTransaction(transactionId);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.LockResolverTransactionNotFound, e);
    }
  }

  private async calculateLockStartingBlock (transaction: BitcoinTransactionModel): Promise<number> {
    if (transaction.confirmations <= 0) {
      throw new SidetreeError(ErrorCode.LockResolverTransactionNotConfirmed, `transaction id: ${transaction.id}`);
    }

    const blockInfo = await this.bitcoinClient.getBlockInfo(transaction.blockHash);

    return blockInfo.height;
  }
}
