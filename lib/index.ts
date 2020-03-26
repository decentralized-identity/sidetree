// NOTE: Aliases to classes and interfaces are used for external consumption.

// Core service exports.
import SidetreeCore from './core/Core';
import SidetreeConfig from './core/models/Config';
import SidetreeResponse from './common/Response';
import SidetreeResponseModel from './common/models/ResponseModel';

export {
  SidetreeConfig,
  SidetreeCore,
  SidetreeResponse,
  SidetreeResponseModel
};

// Blockchain service exports.
import SidetreeBitcoinProcessor from './bitcoin/BitcoinProcessor';
import ISidetreeBitcoinConfig from './bitcoin/IBitcoinConfig';

export {
  ISidetreeBitcoinConfig,
  SidetreeBitcoinProcessor
};

// IPFS service exports.
import SidetreeIpfsService from './ipfs/RequestHandler';

export {
  SidetreeIpfsService
};
