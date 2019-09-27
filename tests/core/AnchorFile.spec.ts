import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import { SidetreeError } from '../../lib/core/Error';
import Encoder from '../../lib/core/versions/latest/Encoder';

describe('AnchorFile', async () => {
  describe('parseAndValidate()', async () => {
    it('should throw if buffer given is not valid JSON.', async () => {
      const anchorFileBuffer = Buffer.from('NotJsonString');
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 1)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileNotJson));
    });

    it('should throw if the buffer is not compressed', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));

      await expectAsync(AnchorFile.parseAndValidate(anchorFileBuffer, 1)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDecompressionFailure));
    });

    it('should throw if has an unknown property.', async () => {
      const anchorFile = {
        unknownProperty: 'Unknown property',
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 1)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty));
    });

    it('should throw if missing batch file hash.', async () => {
      const anchorFile = {
        // batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what is missing.
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 1)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileBatchFileHashMissing));
    });

    it('should throw if missing DID unique suffix.', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        // didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A'], // Intentionally kept to show what is missing.
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 1)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesMissing));
    });

    it('should throw if missing Merkle root hash.', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
        // merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' // Intentionally kept to show what is missing.
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 1)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMerkleRootMissing));
    });

    it('should throw if batch file hash is not string.', async () => {
      const anchorFile = {
        batchFileHash: 12345,
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 1)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileBatchFileHashNotString));
    });

    it('should throw if batch file hash is invalid.', async () => {
      const anchorFile = {
        batchFileHash: 'InvalidHash',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      try {
        const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
        const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

        await AnchorFile.parseAndValidate(anchorFileCompressed, 1);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileBatchFileHashUnsupported);
      }
    });

    it('should throw if Merkle root hash is not string.', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 12345
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 1)).toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileMerkleRootNotString));
    });

    it('should throw if Merkle root hash is invalid.', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'InvalidHash'
      };
      try {
        const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
        const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

        await AnchorFile.parseAndValidate(anchorFileCompressed, 1);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileMerkleRootUnsupported);
      }
    });

    it('should throw if DID unique suffixes is not an array.', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: 'IncorrectType',
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 1))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesNotArray));
    });

    it('should throw if DID unique suffixes is not an array.', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 1))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileExceededMaxOperationCount));
    });

    it('should throw if DID unique suffixes has duplicates.', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 2))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesHasDuplicates));
    });

    it('should throw if a DID unique suffix is not string.', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 12345],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

      await expectAsync(AnchorFile.parseAndValidate(anchorFileCompressed, 2))
        .toBeRejectedWith(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixEntryNotString));
    });

    it('should throw if a DID unique suffix is invalid.', async () => {
      const anchorFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['SuperLongDidUniqueSuffixSuperLongDidUniqueSuffixSuperLongDidUniqueSuffix'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      try {
        const anchorFileBuffer = Buffer.from(JSON.stringify(anchorFile));
        const anchorFileCompressed = await Compressor.compressAsBuffer(anchorFileBuffer);

        await AnchorFile.parseAndValidate(anchorFileCompressed, 1);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileDidUniqueSuffixTooLong);
      }
    });
  });

  describe('createBufferFromAnchorFileModel', async () => {
    it('should created a compressed buffer correctly.', async () => {
      const anchorFile = {
        batchFileHash: 'val1',
        didUniqueSuffixes: ['val2'],
        merkleRoot: 'val3'
      };

      const bufferFromCode = await AnchorFile.createBufferFromAnchorFileModel(anchorFile);
      const bufferFromCodeEncoded = Encoder.encode(bufferFromCode);

      // Calculated this manually to validate the output
      const expectedEncodedBuffer = 'H4sIAAAAAAAACqtWSkosSc5wy8xJ9UgszlCyUipLzDFU0lFKyUwJzcssLE0NLk1Ly6xILVayigbJGSnF6ijlphZl56QG5eeXQDQYK9UCAA8KKHBJAAAA';

      expect(bufferFromCodeEncoded).toEqual(expectedEncodedBuffer);
    });
  });
});
