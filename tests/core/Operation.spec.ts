import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Operation from '../../lib/core/versions/latest/Operation';
import Multihash from '../../lib/core/versions/latest/Multihash';
import SidetreeError from '../../lib/common/SidetreeError';

describe('Operation', async () => {
  describe('parsePatchData()', async () => {
    it('should throw if patch data is not string', async () => {
      await expectAsync(Operation.parsePatchData(123)).toBeRejectedWith(new SidetreeError(ErrorCode.PatchDataMissingOrNotString));
    });

    it('should throw if patch data contains an additional unknown property.', async () => {
      const patchData = {
        patches: 'any opaque content',
        nextUpdateCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedPatchData = Encoder.encode(JSON.stringify(patchData));
      await expectAsync(Operation.parsePatchData(encodedPatchData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.PatchDataMissingOrUnknownProperty));
    });

    it('should throw if patch data is missing patches property.', async () => {
      const patchData = {
        // patches: 'any opaque content', // Intentionally missing.
        nextUpdateCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        unknownProperty: 'An unknown property'
      };
      const encodedPatchData = Encoder.encode(JSON.stringify(patchData));
      await expectAsync(Operation.parsePatchData(encodedPatchData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.OperationDocumentPatchesMissing));
    });
  });
});
