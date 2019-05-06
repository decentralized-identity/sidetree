// NOTE: Aliases to classes and interfaces are used for external consumption.

// Core service exports.
import SidetreeCore from './Core';
import { IConfig as ISidetreeConfig } from './Config';
import { IProtocolParameters as ISidetreeProtocolParameters } from './ProtocolParameters';
import {
  IResponse as ISidetreeResponse,
  Response as SidetreeResponse
} from './Response';

export {
  ISidetreeConfig,
  ISidetreeProtocolParameters,
  ISidetreeResponse,
  SidetreeCore,
  SidetreeResponse
};

// Blockchain service exports.
import SidetreeBitcoinService from './bitcoin/BlockchainService';
import { IBitcoinConfig as ISidetreeBitcoinConfig } from './bitcoin/BitcoinConfig';

export {
  ISidetreeBitcoinConfig,
  SidetreeBitcoinService
};
