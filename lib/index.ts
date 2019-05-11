// NOTE: Aliases to classes and interfaces are used for external consumption.

// Core service exports.
import SidetreeCore from './core/Core';
import { IConfig as ISidetreeConfig } from './core/Config';
import { IProtocolParameters as ISidetreeProtocolParameters } from './core/ProtocolParameters';
import {
  IResponse as ISidetreeResponse,
  Response as SidetreeResponse
} from './core/Response';

export {
  ISidetreeConfig,
  ISidetreeProtocolParameters,
  ISidetreeResponse,
  SidetreeCore,
  SidetreeResponse
};

// Blockchain service exports.
import BitcoinProcessor from './bitcoin/BitcoinProcessor';
import { IBitcoinConfig as ISidetreeBitcoinConfig } from './bitcoin/IBitcoinConfig';

export {
  ISidetreeBitcoinConfig,
  BitcoinProcessor
};

// IPFS service exports.
import SidetreeIpfsService from './ipfs/RequestHandler';

export {
  SidetreeIpfsService
};
