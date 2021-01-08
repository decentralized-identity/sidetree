// NOTE: Aliases to classes and interfaces are used for external consumption.

import ISidetreeBitcoinConfig from './bitcoin/IBitcoinConfig';
import ISidetreeBitcoinWallet from './bitcoin/interfaces/IBitcoinWallet';
import ISidetreeCas from './core/interfaces/ICas';
import ISidetreeEventEmitter from './common/interfaces/IEventEmitter';
import ISidetreeLogger from './common/interfaces/ILogger';
import SidetreeBitcoinProcessor from './bitcoin/BitcoinProcessor';
import SidetreeBitcoinVersionModel from './bitcoin/models/BitcoinVersionModel';
import SidetreeConfig from './core/models/Config';
import SidetreeCore from './core/Core';
import SidetreeResponse from './common/Response';
import SidetreeResponseModel from './common/models/ResponseModel';
import SidetreeVersionModel from './core/models/VersionModel';

// Core service exports.
export {
  ISidetreeCas,
  SidetreeConfig,
  SidetreeCore,
  SidetreeResponse,
  SidetreeResponseModel,
  SidetreeVersionModel
};

// Blockchain service exports.
export {
  ISidetreeBitcoinConfig,
  ISidetreeBitcoinWallet,
  SidetreeBitcoinProcessor,
  SidetreeBitcoinVersionModel
};

// Common exports.
export {
  ISidetreeEventEmitter,
  ISidetreeLogger
};
