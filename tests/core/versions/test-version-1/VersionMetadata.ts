import AbstractVersionMetadata from '../../../../lib/core/AbstractVersionMetadata';
const protocolParameters = require('./protocol-parameters.json');

/**
 * Implementation of the VersionMetadata.
 */
export default class VersionMetadata extends AbstractVersionMetadata {
  public hashAlgorithmInMultihashCode: number;
  public normalizedFeeToPerOperationFeeMultiplier: number;

  public constructor () {
    super();
    this.normalizedFeeToPerOperationFeeMultiplier = protocolParameters.normalizedFeeToPerOperationFeeMultiplier;
    this.hashAlgorithmInMultihashCode = protocolParameters.hashAlgorithmInMultihashCode;
  }
};
