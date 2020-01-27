// NOTE: Aliases to classes and interfaces are used for external consumption.

// Core service exports.
import SidetreeCore from './core/Core';
import SidetreeConfig from './core/models/Config';
import {
  ResponseModel as SidetreeResponseModel,
  Response as SidetreeResponse
} from './common/Response';

export {
  SidetreeConfig,
  SidetreeCore,
  SidetreeResponse,
  SidetreeResponseModel
};

// Blockchain service exports.
import SidetreeBitcoinProcessor from './bitcoin/BitcoinProcessor';
import { IBitcoinConfig as ISidetreeBitcoinConfig } from './bitcoin/IBitcoinConfig';

export { ISidetreeBitcoinConfig, SidetreeBitcoinProcessor };

// IPFS service exports.
import SidetreeIpfsService from './ipfs/RequestHandler';

export { SidetreeIpfsService };
