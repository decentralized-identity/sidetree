// NOTE: Aliases to classes and interfaces are used for external consumption.

// Core service exports.
import ISidetreeCas from './core/interfaces/ICas';
import SidetreeCore from './core/Core';
import SidetreeConfig from './core/models/Config';
import SidetreeResponse from './common/Response';
import SidetreeResponseModel from './common/models/ResponseModel';
import SidetreeVersionModel from './common/models/VersionModel';

export {
  ISidetreeCas,
  SidetreeConfig,
  SidetreeCore,
  SidetreeResponse,
  SidetreeResponseModel,
  SidetreeVersionModel
};

// Blockchain service exports.
import SidetreeBitcoinProcessor from './bitcoin/BitcoinProcessor';
import ISidetreeBitcoinConfig from './bitcoin/IBitcoinConfig';
import ISidetreeBitcoinWallet from './bitcoin/interfaces/IBitcoinWallet';

export {
  ISidetreeBitcoinConfig,
  ISidetreeBitcoinWallet,
  SidetreeBitcoinProcessor
};
