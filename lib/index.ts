// Creating aliases to classes and interfaces used for external consumption.
import SidetreeBitcoinService from './BlockchainService';
import SidetreeResponse, { IResponse as ISidetreeResponse } from './Response';
import { IConfig as ISidetreeBitcoinConfig } from './Config';

export {
  ISidetreeBitcoinConfig,
  ISidetreeResponse,
  SidetreeBitcoinService,
  SidetreeResponse
};
