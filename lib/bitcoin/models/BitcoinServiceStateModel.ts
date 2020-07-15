import BlockMetadata from './BlockMetadata';

/**
 * Bitcoin microservice state.
 */
export default interface BitcoinServiceStateModel {
  lastProcessedBlock?: BlockMetadata;
  serviceVersion: string;
}
