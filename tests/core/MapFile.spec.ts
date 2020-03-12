import Compressor from '../../lib/core/versions/latest/util/Compressor';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import MapFile from '../../lib/core/versions/latest/MapFile';
import MapFileModel from '../../lib/core/versions/latest/models/MapFileModel';
import SidetreeError from '../../lib/common/SidetreeError';

describe('MapFile', async () => {
  describe('parseAndValidate()', async () => {
    it('should throw if buffer given is not valid JSON.', async () => {
      const fileBuffer = Buffer.from('NotJsonString');
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => MapFile.parseAndValidate(fileCompressed),
        ErrorCode.MapFileNotJson);
    });

    it('should throw if the buffer is not compressed', async () => {
      const mapFileModel: MapFileModel = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFileModel));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => MapFile.parseAndValidate(fileBuffer),
        ErrorCode.MapFileDecompressionFailure);
    });

    it('should throw if has an unknown property.', async () => {
      const mapFile = {
        unknownProperty: 'Unknown property',
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(MapFile.parseAndValidate(fileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.MapFileHasUnknownProperty));
    });

    it('should throw if missing map file hash.', async () => {
      const mapFile = {
        // batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what the expected property should be.
        anchorFileHash: 'Incorrect property'
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(MapFile.parseAndValidate(fileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.MapFileBatchFileHashMissingOrIncorrectType));
    });
  });
});
