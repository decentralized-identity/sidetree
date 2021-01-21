import JwkEs256k from '../../../models/JwkEs256k';

/**
 * Defines the internal decoded schema of signed data of a recover operation.
 */
export default interface DeactivateSignedDataModel {
  didSuffix: string;
  recoveryKey: JwkEs256k;
}
