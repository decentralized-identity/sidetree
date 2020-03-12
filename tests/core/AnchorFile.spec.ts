import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import SidetreeError from '../../lib/common/SidetreeError';
import ProtocolParameters from '../../lib/core/versions/latest/ProtocolParameters';

describe('AnchorFile', async () => {
  describe('parseAndValidate()', async () => {
    it('should throw if buffer given is not valid JSON.', async () => {
      const anchorFileBuffer = Buffer.from('NotJsonString');
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parseAndValidate(anchorFileCompressed),
        ErrorCode.AnchorFileNotJson);
    });

    it('should throw if the buffer is not compressed', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => AnchorFile.parseAndValidate(anchorFileBuffer),
        ErrorCode.AnchorFileDecompressionFailure);
    });

    it('should throw if has an unknown property.', async () => {
      const anchorFile = {
        unknownProperty: 'Unknown property',
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty));
    });

    it('should throw if missing map file hash.', async () => {
      const anchorFile = {
        // mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what is missing.
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMapFileHashMissing));
    });

    it('should throw if missing DID unique suffix.', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
        // didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A'], // Intentionally kept to show what is missing.
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesMissing));
    });

    it('should throw if map file hash is not string.', async () => {
      const anchorFile = {
        mapFileHash: 12345,
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMapFileHashNotString));
    });

    it('should throw if map file hash is invalid.', async () => {
      const anchorFile = {
        mapFileHash: 'InvalidHash',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      try {
        const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
        const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

        await AnchorFile.parseAndValidate(anchorFileCompressed);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileMapFileHashUnsupported);
      }
    });

    it('should throw if DID unique suffixes is not an array.', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: 'IncorrectType'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesNotArray));
    });

    it('should throw if operation count exceeded limit.', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      // Overreid the default max operation count per batch.
      const originalMaxOperationsPerBatch = ProtocolParameters.maxOperationsPerBatch;
      ProtocolParameters.maxOperationsPerBatch = 1;

      try {
        await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileExceededMaxOperationCount));
      } finally {
        ProtocolParameters.maxOperationsPerBatch = originalMaxOperationsPerBatch;
      }
    });

    it('should throw if DID unique suffixes has duplicates.', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A']
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesHasDuplicates));
    });

    it('should throw if a DID unique suffix is not string.', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 12345]
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixEntryNotString));
    });

    it('should throw if a DID unique suffix is invalid.', async () => {
      const anchorFile = {
        mapFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['SuperLongDidUniqueSuffixSuperLongDidUniqueSuffixSuperLongDidUniqueSuffix']
      };
      try {
        const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
        const anchorFileCompressed = await Compressor.compress(anchorFileBuffer);

        await AnchorFile.parseAndValidate(anchorFileCompressed);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileDidUniqueSuffixTooLong);
      }
    });
  });

  describe('createBufferFromAnchorFileModel', async () => {
    it('should created a compressed buffer correctly.', async () => {
      const anchorFile = {
        mapFileHash: 'val1',
        didUniqueSuffixes: ['val2']
      };

      const bufferFromCode = await AnchorFile.createBufferFromAnchorFileModel(anchorFile);

      // Calculated this manually to validate the output
      const expectedEncodedBuffer = 'H4sIAAAAAAAACqtWyk0scMvMSfVILM5QslIqS8wxVNJRSslMCc3LLCxNDS5NS8usSC1WsooGyRkpxdYCACZUzsYzAAAA';
      const expectedBuffer = Encoder.decodeAsBuffer(expectedEncodedBuffer);

      // Removing the first 10 bytes of the buffer as those are the header bytes in gzip are
      // the header bytes which are effected by the current operating system. So if the tests
      // run on a different OS, those bytes change even though they don't effect the actual
      // decompression/compression.
      expect(bufferFromCode.slice(10)).toEqual(expectedBuffer.slice(10));
    });
  });
});
