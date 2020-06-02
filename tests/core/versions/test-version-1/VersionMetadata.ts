import AbstractVersionMetadata from '../../../../lib/core/abstracts/AbstractVersionMetadata';
const protocolParameters = require('./protocol-parameters.json');

/**
 * Implementation of the abstract VersionMetadata.
 */
export default class VersionMetadata extends AbstractVersionMetadata {
  public hashAlgorithmInMultihashCode: number;
  public normalizedFeeToPerOperationFeeMultiplier: number;
  public valueTimeLockAmountMultiplier: number;

  public constructor () {
    super();
    this.normalizedFeeToPerOperationFeeMultiplier = protocolParameters.normalizedFeeToPerOperationFeeMultiplier;
    this.hashAlgorithmInMultihashCode = protocolParameters.hashAlgorithmInMultihashCode;
    this.valueTimeLockAmountMultiplier = protocolParameters.valueTimeLockAmountMultiplier;
  }
}
