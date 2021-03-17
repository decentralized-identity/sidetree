// NOTE: Aliases to classes and interfaces are used for external consumption.

import ISidetreeBitcoinConfig from './bitcoin/IBitcoinConfig';
import ISidetreeBitcoinWallet from './bitcoin/interfaces/IBitcoinWallet';
import ISidetreeCas from './core/interfaces/ICas';
import ISidetreeEventEmitter from './common/interfaces/IEventEmitter';
import ISidetreeLogger from './common/interfaces/ILogger';
import SidetreeBitcoinEventCode from './bitcoin/EventCode';
import SidetreeBitcoinMonitor from './bitcoin/Monitor';
import SidetreeBitcoinProcessor from './bitcoin/BitcoinProcessor';
import SidetreeBitcoinVersionModel from './bitcoin/models/BitcoinVersionModel';
import SidetreeConfig from './core/models/Config';
import SidetreeCore from './core/Core';
import SidetreeEventCode from './core/EventCode';
import SidetreeMonitor from './core/Monitor';
import SidetreeResponse from './common/Response';
import SidetreeResponseModel from './common/models/ResponseModel';
import SidetreeVersionModel from './core/models/VersionModel';

// Core service exports.
export {
  ISidetreeCas,
  SidetreeConfig,
  SidetreeCore,
  SidetreeEventCode,
  SidetreeMonitor,
  SidetreeResponse,
  SidetreeResponseModel,
  SidetreeVersionModel
};

// Blockchain service exports.
export {
  ISidetreeBitcoinConfig,
  ISidetreeBitcoinWallet,
  SidetreeBitcoinEventCode,
  SidetreeBitcoinMonitor,
  SidetreeBitcoinProcessor,
  SidetreeBitcoinVersionModel
};

// Common exports.
export {
  ISidetreeEventEmitter,
  ISidetreeLogger
};
