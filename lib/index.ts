// NOTE: Aliases to classes and interfaces are used for external consumption.

// Core service exports.
import SidetreeCore from './core/Core';
import ISidetreeConfig from './core/IConfig';
import { IProtocolParameters as ISidetreeProtocolParameters } from './core/ProtocolParameters';
import {
  IResponse as ISidetreeResponse,
  Response as SidetreeResponse
} from './common/Response';

export {
  ISidetreeConfig,
  ISidetreeProtocolParameters,
  ISidetreeResponse,
  SidetreeCore,
  SidetreeResponse
};

// Blockchain service exports.
import SidetreeBitcoinProcessor from './bitcoin/BitcoinProcessor';
import { IBitcoinConfig as ISidetreeBitcoinConfig } from './bitcoin/IBitcoinConfig';

export {
  ISidetreeBitcoinConfig,
  SidetreeBitcoinProcessor
};

// IPFS service exports.
import SidetreeIpfsService from './ipfs/RequestHandler';

export {
  SidetreeIpfsService
};
