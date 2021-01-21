import JwkEs256k from '../../../models/JwkEs256k';

/**
 * Defines the internal decoded schema of signed data of a update operation.
 */
export default interface UpdateSignedDataModel {
  deltaHash: string;
  updateKey: JwkEs256k;
}
