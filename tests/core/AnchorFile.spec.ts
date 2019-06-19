import AnchorFile from '../../lib/core/AnchorFile';
import ErrorCode from '../../lib/common/ErrorCode';
import { SidetreeError } from '../../lib/core/Error';

describe('AnchorFile', async () => {
  describe('parseAndValidate()', async () => {
    const hashAlgorithmInMultihashCode = 18;

    it('should throw if buffer given is not valid JSON.', async () => {
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from('NotJsonString'), 1, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileNotJson));
    });

    it('should throw if has an unknown property.', async () => {
      const anchoreFile = {
        unknownProperty: 'Unknown property',
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty));
    });

    it('should throw if missing batch file hash.', async () => {
      const anchoreFile = {
        // batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', // Intentionally kept to show what is missing.
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileBatchFileHashMissing));
    });

    it('should throw if missing DID unique suffix.', async () => {
      const anchoreFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        // didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A'], // Intentionally kept to show what is missing.
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesMissing));
    });

    it('should throw if missing Merkle root hash.', async () => {
      const anchoreFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow']
        // merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA' // Intentionally kept to show what is missing.
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileMerkleRootMissing));
    });

    it('should throw if batch file hash is not string.', async () => {
      const anchoreFile = {
        batchFileHash: 12345,
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileBatchFileHashNotString));
    });

    it('should throw if batch file hash is invalid.', async () => {
      const anchoreFile = {
        batchFileHash: 'InvalidHash',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const hashAlgorithmInMultihashCode = 18;
      try {
        AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileBatchFileHashUnsupported);
      }
    });

    it('should throw if Merkle root hash is not string.', async () => {
      const anchoreFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 12345
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileMerkleRootNotString));
    });

    it('should throw if Merkle root hash is invalid.', async () => {
      const anchoreFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'InvalidHash'
      };
      try {
        AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileMerkleRootUnsupported);
      }
    });

    it('should throw if DID unique suffixes is not an array.', async () => {
      const anchoreFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: 'IncorrectType',
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesNotArray));
    });

    it('should throw if DID unique suffixes is not an array.', async () => {
      const anchoreFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileExceededMaxOperationCount));
    });

    it('should throw if DID unique suffixes has duplicates.', async () => {
      const anchoreFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 2, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesHasDuplicates));
    });

    it('should throw if a DID unique suffix is not string.', async () => {
      const anchoreFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 12345],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      const parseAndValidate = () => AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 2, hashAlgorithmInMultihashCode);
      expect(parseAndValidate).toThrow(new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixEntryNotString));
    });

    it('should throw if a DID unique suffix is invalid.', async () => {
      const anchoreFile = {
        batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
        didUniqueSuffixes: ['InvalidUniqueSuffix'],
        merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
      };
      try {
        AnchorFile.parseAndValidate(Buffer.from(JSON.stringify(anchoreFile)), 1, hashAlgorithmInMultihashCode);
      } catch (error) {
        expect(error.code).toEqual(ErrorCode.AnchorFileDidUniqueSuffixEntryInvalid);
      }
    });
  });
});
