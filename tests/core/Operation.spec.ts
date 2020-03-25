import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Operation from '../../lib/core/versions/latest/Operation';
import Multihash from '../../lib/core/versions/latest/Multihash';
import SidetreeError from '../../lib/common/SidetreeError';

describe('Operation', async () => {
  describe('parseOperationData()', async () => {
    it('should throw if operation data is not string', async () => {
      await expectAsync(Operation.parseOperationData(123)).toBeRejectedWith(new SidetreeError(ErrorCode.OperationDataMissingOrNotString));
    });

    it('should throw if operation data contains an additional unknown property.', async () => {
      const operationData = {
        patches: 'any opaque content',
        nextUpdateOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(operationData));
      await expectAsync(Operation.parseOperationData(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.OperationDataMissingOrUnknownProperty));
    });

    it('should throw if operation data is missing patches property.', async () => {
      const operationData = {
        // patches: 'any opaque content', // Intentionally missing.
        nextUpdateOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        unknownProperty: 'An unknown property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(operationData));
      await expectAsync(Operation.parseOperationData(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.OperationDocumentPatchesMissing));
    });
  });
});
