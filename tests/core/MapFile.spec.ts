import Compressor from '../../lib/core/versions/latest/util/Compressor';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import MapFile from '../../lib/core/versions/latest/MapFile';
import MapFileModel from '../../lib/core/versions/latest/models/MapFileModel';
import SidetreeError from '../../lib/common/SidetreeError';

describe('MapFile', async () => {
  describe('parse()', async () => {
    it('should throw if buffer given is not valid JSON.', async () => {
      const fileBuffer = Buffer.from('NotJsonString');
      const fileCompressed = await Compressor.compress(fileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => MapFile.parse(fileCompressed),
        ErrorCode.MapFileNotJson);
    });

    it('should throw if the buffer is not compressed', async () => {
      const mapFileModel: MapFileModel = {
        chunks: [ { chunk_file_uri: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' } ]
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFileModel));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => MapFile.parse(fileBuffer),
        ErrorCode.MapFileDecompressionFailure);
    });

    it('should throw if has an unknown property.', async () => {
      const mapFile = {
        unknownProperty: 'Unknown property',
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(MapFile.parse(fileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.MapFileHasUnknownProperty));
    });

    it('should throw if missing batch file hash.', async () => {
      const mapFile = {
        // batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what the expected property should be.
      };
      const fileBuffer = Buffer.from(JSON.stringify(mapFile));
      const fileCompressed = await Compressor.compress(fileBuffer);

      await expectAsync(MapFile.parse(fileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.MapFileChunksPropertyMissingOrIncorrectType));
    });
  });
});
