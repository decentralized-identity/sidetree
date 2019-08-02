import IVersionInfo from '../../interfaces/IVersionInfo';
import protocolParameters from './ProtocolParameters';

/**
 * Implementation of the IVersionInfo.
 */
export default class VersionInfo implements IVersionInfo {
  public hashAlgorithmInMultihashCode: number;

  public constructor () {
    this.hashAlgorithmInMultihashCode = protocolParameters.hashAlgorithmInMultihashCode;
  }
}
