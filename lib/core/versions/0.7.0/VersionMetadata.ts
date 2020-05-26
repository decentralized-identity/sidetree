import AbstractVersionMetadata from '../../AbstractVersionMetadata';
import ProtocolParameters from './ProtocolParameters';

/**
 * Implementation of the VersionMetadata.
 */
export default class VersionMetadata extends AbstractVersionMetadata {
  public hashAlgorithmInMultihashCode: number;
  public normalizedFeeToPerOperationFeeMultiplier: number;
  public constructor () {
    super();
    this.hashAlgorithmInMultihashCode = ProtocolParameters.hashAlgorithmInMultihashCode;
    this.normalizedFeeToPerOperationFeeMultiplier = ProtocolParameters.normalizedFeeToPerOperationFeeMultiplier;
  }
}
