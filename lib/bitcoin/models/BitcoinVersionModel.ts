import ProtocolParameters from './ProtocolParameters';

/**
 * Defines an bitcoin implementation version and its starting blockchain time.
 */
export default interface BitcoinVersionModel {
    /** The inclusive starting logical blockchain time that this version applies to. */
    startingBlockchainTime: number;
    version: string;
    protocolParameters: ProtocolParameters;
}
