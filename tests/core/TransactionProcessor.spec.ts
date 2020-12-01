import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import AnchorFileModel from '../../lib/core/versions/latest/models/AnchorFileModel';
import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';
import ChunkFile from '../../lib/core/versions/latest/ChunkFile';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import CoreProofFile from '../../lib/core/versions/latest/CoreProofFile';
import DownloadManager from '../../lib/core/DownloadManager';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import FetchResult from '../../lib/common/models/FetchResult';
import FetchResultCode from '../../lib/common/enums/FetchResultCode';
import FileGenerator from '../generators/FileGenerator';
import IBlockchain from '../../lib/core/interfaces/IBlockchain';
import Ipfs from '../../lib/ipfs/Ipfs';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import MapFile from '../../lib/core/versions/latest/MapFile';
import MockBlockchain from '../mocks/MockBlockchain';
import MockOperationStore from '../mocks/MockOperationStore';
import Operation from '../../lib/core/versions/latest/Operation';
import OperationGenerator from '../generators/OperationGenerator';
import ProvisionalProofFile from '../../lib/core/versions/latest/ProvisionalProofFile';
import SidetreeError from '../../lib/common/SidetreeError';
import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionProcessor from '../../lib/core/versions/latest/TransactionProcessor';
import ValueTimeLockModel from '../../lib/common/models/ValueTimeLockModel';
import ValueTimeLockVerifier from '../../lib/core/versions/latest/ValueTimeLockVerifier';

describe('TransactionProcessor', () => {
  let casClient: Ipfs;
  let operationStore: MockOperationStore;
  let downloadManager: DownloadManager;
  let blockchain: IBlockchain;
  let transactionProcessor: TransactionProcessor;
  let versionMetadataFetcher: any = {};
  const versionMetadata = {
    normalizedFeeToPerOperationFeeMultiplier: 0.01
  };
  versionMetadataFetcher = {
    getVersionMetadata: () => {
      return versionMetadata;
    }
  };

  beforeEach(() => {
    const fetchTimeoutInSeconds = 1;
    casClient = new Ipfs('unusedUri', fetchTimeoutInSeconds);

    const maxConcurrentDownloads = 10;
    downloadManager = new DownloadManager(maxConcurrentDownloads, casClient);
    downloadManager.start();

    operationStore = new MockOperationStore();
    blockchain = new MockBlockchain();
    transactionProcessor = new TransactionProcessor(downloadManager, operationStore, blockchain, versionMetadataFetcher);
  });

  describe('processTransaction()', () => {
    it('should ignore error and return true when AnchoredDataSerializer throws a sidetree error', async () => {
      const anchoredData = 'Bad Format';
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 1,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should ignore error and return true when FeeManager throws a sidetree error', async () => {
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 0 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 1,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should return true if anchor file hash is not valid', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.InvalidHash };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should return true if fetch result code is max size exceeded', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.MaxSizeExceeded };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should return true if fetch result code is not a file', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.NotAFile };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should return true if fetch result code is cas not reachable', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.CasNotReachable };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeFalsy();
    });

    it('should return true if fetch result code is not found', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.NotFound };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeFalsy();
    });

    it('should return false to allow retry if unexpected error is thrown', async () => {
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };

      // Mock a method used by `processTransaction` to throw an error.
      spyOn(AnchoredDataSerializer, 'deserialize').and.throwError('Some unexpected error.');

      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeFalsy();
    });
  });

  describe('downloadAndVerifyAnchorFile', () => {
    it('should throw if paid operation count exceeded the protocol limit.', async (done) => {
      const mockTransaction: TransactionModel = {
        anchorString: 'anchor string',
        normalizedTransactionFee: 123,
        transactionFeePaid: 1234,
        transactionNumber: 98765,
        transactionTime: 5678,
        transactionTimeHash: 'transaction time hash',
        writer: 'writer'
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyAnchorFile'](mockTransaction, 'mock_hash', 999999), // Some really large paid operation count.
        ErrorCode.TransactionProcessorPaidOperationCountExceedsLimit);

      done();
    });

    it('should throw if operation count in anchor file exceeded the paid limit.', async (done) => {
      const createOperation1 = (await OperationGenerator.generateCreateOperation()).createOperation;
      const createOperation2 = (await OperationGenerator.generateCreateOperation()).createOperation;
      const anyHash = OperationGenerator.generateRandomHash();
      const mockAnchorFileModel = await AnchorFile.createModel('writerLockId', anyHash, undefined, [createOperation1, createOperation2], [], []);
      const mockAnchorFileBuffer = await Compressor.compress(Buffer.from(JSON.stringify(mockAnchorFileModel)));

      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockAnchorFileBuffer));

      const mockTransaction: TransactionModel = {
        anchorString: 'anchor string',
        normalizedTransactionFee: 123,
        transactionFeePaid: 1234,
        transactionNumber: 98765,
        transactionTime: 5678,
        transactionTimeHash: 'transaction time hash',
        writer: 'writer'
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyAnchorFile'](mockTransaction, 'mock_hash', 1),
        ErrorCode.AnchorFileOperationCountExceededPaidLimit);

      done();
    });

    it('should bubble up any errors thrown by verify lock routine', async (done) => {
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(Buffer.from('value')));

      const mockAnchorFile: AnchorFile = {
        createDidSuffixes: [],
        didUniqueSuffixes: ['abc', 'def'],
        model: { writerLockId: 'lock', provisionalIndexFileUri: 'map_hash', operations: {} },
        recoverDidSuffixes: [],
        deactivateDidSuffixes: []
      };
      spyOn(AnchorFile, 'parse').and.returnValue(Promise.resolve(mockAnchorFile));

      const mockValueTimeLock: ValueTimeLockModel = {
        amountLocked: 1234,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        normalizedFee: 200,
        owner: 'owner'
      };
      spyOn(transactionProcessor['blockchain'], 'getValueTimeLock').and.returnValue(Promise.resolve(mockValueTimeLock));

      const mockTransaction: TransactionModel = {
        anchorString: 'anchor string',
        normalizedTransactionFee: 123,
        transactionFeePaid: 1234,
        transactionNumber: 98765,
        transactionTime: 5678,
        transactionTimeHash: 'transaction time hash',
        writer: 'writer'
      };

      const mockErrorCode = 'some error code';
      const lockVerifySpy = spyOn(ValueTimeLockVerifier, 'verifyLockAmountAndThrowOnError').and.callFake(() => {
        throw new SidetreeError(mockErrorCode);
      });

      const paidOperationCount = 52;
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyAnchorFile'](mockTransaction, 'anchor_hash', paidOperationCount),
        mockErrorCode);

      expect(lockVerifySpy)
        .toHaveBeenCalledWith(
          mockValueTimeLock,
          paidOperationCount,
          mockTransaction.transactionTime,
          mockTransaction.writer,
          versionMetadataFetcher);
      done();
    });

    it('should return the parsed file.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const anyHash = OperationGenerator.generateRandomHash();
      const mockAnchorFileModel = await AnchorFile.createModel(undefined, anyHash, undefined, [createOperationData.createOperation], [], []);
      const mockAnchorFileBuffer = await Compressor.compress(Buffer.from(JSON.stringify(mockAnchorFileModel)));

      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockAnchorFileBuffer));
      spyOn(transactionProcessor['blockchain'], 'getValueTimeLock').and.returnValue(Promise.resolve(undefined));
      spyOn(ValueTimeLockVerifier, 'verifyLockAmountAndThrowOnError').and.returnValue(undefined);

      const mockTransaction: TransactionModel = {
        anchorString: 'anchor string',
        normalizedTransactionFee: 123,
        transactionFeePaid: 1234,
        transactionNumber: 98765,
        transactionTime: 5678,
        transactionTimeHash: 'transaction time hash',
        writer: 'writer'
      };

      const paidBatchSize = 2;
      const downloadedAnchorFile = await transactionProcessor['downloadAndVerifyAnchorFile'](mockTransaction, 'mock_hash', paidBatchSize);
      expect(JSON.stringify(downloadedAnchorFile.model)).toEqual(JSON.stringify(mockAnchorFileModel));
      done();
    });
  });

  describe('downloadAndVerifyMapFile', () => {
    it('should validate a valid map file for the case that it does not have the `operations` property.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const anchorFileBuffer =
      await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [createOperationData.createOperation], [], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Setting up a mock map file that has 1 update in it to be downloaded.
      const provisionalProofFileHash = undefined;
      const chunkFileHash = OperationGenerator.generateRandomHash();
      const mockMapFileBuffer = await MapFile.createBuffer(chunkFileHash, provisionalProofFileHash, []);
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockMapFileBuffer));

      // Setting the total paid operation count to be 1 (needs to be at least 2 in success case).
      const totalPaidOperationCount = 1;
      const fetchedMapFile = await transactionProcessor['downloadAndVerifyMapFile'](anchorFile, totalPaidOperationCount);

      expect(fetchedMapFile).toBeDefined();
      expect(fetchedMapFile!.didUniqueSuffixes.length).toEqual(0);
      expect(fetchedMapFile!.model.chunks[0].chunkFileUri).toEqual(chunkFileHash);
      done();
    });

    it('should return undefined if update operation count is greater than the max paid update operation count.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const anchorFileBuffer =
      await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [createOperationData.createOperation], [], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Setting up a mock map file that has 1 update in it to be downloaded.
      const provisionalProofFileHash = undefined;
      const updateOperationRequestData = await OperationGenerator.generateUpdateOperationRequest();
      const chunkFileHash = OperationGenerator.generateRandomHash();
      const mockMapFileBuffer = await MapFile.createBuffer(chunkFileHash, provisionalProofFileHash, [updateOperationRequestData.updateOperation]);
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockMapFileBuffer));

      // Setting the total paid operation count to be 1 (needs to be at least 2 in success case).
      const totalPaidOperationCount = 1;
      const fetchedMapFile = await transactionProcessor['downloadAndVerifyMapFile'](anchorFile, totalPaidOperationCount);

      expect(fetchedMapFile).toBeUndefined();
      done();
    });

    it('should return undefined if anchor file does not contain the provisional index file URI.', async () => {
      const deactivateDidSuffix = OperationGenerator.generateRandomHash();
      const anchorFileModel: AnchorFileModel = {
        coreProofFileUri: OperationGenerator.generateRandomHash(),
        operations: {
          deactivate: [
            {
              didSuffix: deactivateDidSuffix,
              revealValue: OperationGenerator.generateRandomHash()
            }
          ]
        }
      };
      const anchorFile = new (AnchorFile as any)(anchorFileModel, [deactivateDidSuffix], [], [], [deactivateDidSuffix]);

      // Setting the total paid operation count to be 1 (needs to be at least 2 in success case).
      const totalPaidOperationCount = 1;
      const fetchedMapFile = await transactionProcessor['downloadAndVerifyMapFile'](anchorFile, totalPaidOperationCount);

      expect(fetchedMapFile).toBeUndefined();
    });

    it('should remove update operation references if paid fee is not enough to cover all updates.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const anchorFileBuffer =
      await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [createOperationData.createOperation], [], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Setting up a mock map file that has 1 update in it to be downloaded.
      const updateDidSuffix = OperationGenerator.generateRandomHash();
      const provisionalProofFileHash = OperationGenerator.generateRandomHash();
      const updateOperationRequestData = await OperationGenerator.generateUpdateOperationRequest(updateDidSuffix);
      const chunkFileHash = OperationGenerator.generateRandomHash();
      const mockMapFileBuffer = await MapFile.createBuffer(chunkFileHash, provisionalProofFileHash, [updateOperationRequestData.updateOperation]);
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockMapFileBuffer));

      const totalPaidOperationCount = 1; // Simulating only 1 operation paid so the update operation referenced should be removed in map file.
      const fetchedMapFile = await transactionProcessor['downloadAndVerifyMapFile'](anchorFile, totalPaidOperationCount);

      expect(fetchedMapFile).toBeDefined();
      expect(fetchedMapFile!.didUniqueSuffixes.length).toEqual(0);
      expect(fetchedMapFile!.model.operations).toBeUndefined();
      expect(fetchedMapFile!.model.provisionalProofFileUri).toBeUndefined();
      done();
    });

    it('should remove update operation references if there is a duplicate DID between anchor and map file.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const anchorFileBuffer =
      await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [createOperationData.createOperation], [], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Setting up a mock map file that has 1 update in it to be downloaded.
      const provisionalProofFileHash = OperationGenerator.generateRandomHash();
      const updateOperationRequestData = await OperationGenerator.generateUpdateOperationRequest(createOperationData.createOperation.didUniqueSuffix);
      const chunkFileHash = OperationGenerator.generateRandomHash();
      const mockMapFileBuffer = await MapFile.createBuffer(chunkFileHash, provisionalProofFileHash, [updateOperationRequestData.updateOperation]);
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockMapFileBuffer));

      const totalPaidOperationCount = 10;
      const fetchedMapFile = await transactionProcessor['downloadAndVerifyMapFile'](anchorFile, totalPaidOperationCount);

      expect(fetchedMapFile).toBeDefined();
      expect(fetchedMapFile!.didUniqueSuffixes.length).toEqual(0);
      expect(fetchedMapFile!.model.operations).toBeUndefined();
      expect(fetchedMapFile!.model.provisionalProofFileUri).toBeUndefined();
      done();
    });

    it('should return undefined if unexpected error caught.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const anchorFileBuffer =
        await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [createOperationData.createOperation], [], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Mocking an unexpected error thrown.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.throwError('Any unexpected error.');

      const totalPaidOperationCount = 10;
      const fetchedMapFile = await transactionProcessor['downloadAndVerifyMapFile'](anchorFile, totalPaidOperationCount);

      expect(fetchedMapFile).toBeUndefined();
      done();
    });

    it('should throw if a network related error is caught.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const anchorFileBuffer =
        await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [createOperationData.createOperation], [], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Mocking a non-network related known error thrown.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.callFake(
        () => { throw new SidetreeError(ErrorCode.CasNotReachable); }
      );

      const totalPaidOperationCount = 10;
      await expectAsync(transactionProcessor['downloadAndVerifyMapFile'](anchorFile, totalPaidOperationCount))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CasNotReachable));

      done();
    });

    it('should return undefined if non-network related known error is caught.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const anchorFileBuffer =
        await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [createOperationData.createOperation], [], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Mocking a non-network related known error thrown.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.callFake(
        () => { throw new SidetreeError(ErrorCode.CasFileTooLarge); }
      );

      const totalPaidOperationCount = 10;
      const fetchedMapFile = await transactionProcessor['downloadAndVerifyMapFile'](anchorFile, totalPaidOperationCount);

      expect(fetchedMapFile).toBeUndefined();
      done();
    });
  });

  describe('downloadAndVerifyCoreProofFile()', () => {
    it('should download and parse the core proof file.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const [, anyPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', recoveryPrivateKey: anyPrivateKey }
      );
      const recoverOperation = recoverOperationData.recoverOperation;

      const deactivateOperationData = await OperationGenerator.createDeactivateOperation('EiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', anyPrivateKey);
      const deactivateOperation = deactivateOperationData.deactivateOperation;

      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = OperationGenerator.generateRandomHash();
      const anchorFileBuffer = await AnchorFile.createBuffer(
        'writerLockId', mapFileHash, coreProofFileHash, [createOperation], [recoverOperation], [deactivateOperation]
      );
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      const mockCoreProofFileBuffer = await CoreProofFile.createBuffer([recoverOperation], [deactivateOperation]);
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockCoreProofFileBuffer));

      const actualProcessedCoreProofFile = await transactionProcessor['downloadAndVerifyCoreProofFile'](anchorFile);
      expect(actualProcessedCoreProofFile).toBeDefined();
      expect(actualProcessedCoreProofFile!.recoverProofs.length).toEqual(1);
      expect(actualProcessedCoreProofFile!.recoverProofs[0].signedDataJws).toEqual(recoverOperationData.recoverOperation.signedDataJws);
      expect(actualProcessedCoreProofFile!.deactivateProofs.length).toEqual(1);
      expect(actualProcessedCoreProofFile!.deactivateProofs[0].signedDataJws).toEqual(deactivateOperationData.deactivateOperation.signedDataJws);
    });

    it('should throw if core proof count is not the same as the recover and deactivate combined count.', async () => {
      const [, anyPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: 'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', recoveryPrivateKey: anyPrivateKey }
      );
      const recoverOperation = recoverOperationData.recoverOperation;

      const deactivateOperationData = await OperationGenerator.createDeactivateOperation('EiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', anyPrivateKey);
      const deactivateOperation = deactivateOperationData.deactivateOperation;

      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = OperationGenerator.generateRandomHash();
      const anchorFileBuffer = await AnchorFile.createBuffer(
        'writerLockId', mapFileHash, coreProofFileHash, [], [recoverOperation], [deactivateOperation]
      );
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      const mockCoreProofFileBuffer = await CoreProofFile.createBuffer([recoverOperation], []); // Intentionally missing proofs for deactivate.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockCoreProofFileBuffer));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyCoreProofFile'](anchorFile),
        ErrorCode.CoreProofFileProofCountNotTheSameAsOperationCountInAnchorFile
      );
    });
  });

  describe('downloadAndVerifyProvisionalProofFile()', () => {
    it('should download and parse the provisional proof file.', async () => {
      const [updatePublicKey, updatePrivateKey] = await Jwk.generateEs256kKeyPair();
      const updateOperationData = await OperationGenerator.generateUpdateOperation(
        'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', updatePublicKey, updatePrivateKey
      );
      const updateOperation = updateOperationData.updateOperation;

      const chunkFileHash = OperationGenerator.generateRandomHash();
      const provisionalProofFileHash = OperationGenerator.generateRandomHash();

      const mapFileBuffer = await MapFile.createBuffer(chunkFileHash, provisionalProofFileHash, [updateOperation]);
      const mapFile = await MapFile.parse(mapFileBuffer);

      const mockProvisionalProofFileBuffer = await ProvisionalProofFile.createBuffer([updateOperation]);
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockProvisionalProofFileBuffer));

      const actualProcessedProvisionalProofFile = await transactionProcessor['downloadAndVerifyProvisionalProofFile'](mapFile);
      expect(actualProcessedProvisionalProofFile).toBeDefined();
      expect(actualProcessedProvisionalProofFile!.updateProofs.length).toEqual(1);
      expect(actualProcessedProvisionalProofFile!.updateProofs[0].signedDataJws).toEqual(updateOperationData.updateOperation.signedDataJws);
    });

    it('should throw if provisional proof count is not the same as update operation count.', async () => {
      const [updatePublicKey, updatePrivateKey] = await Jwk.generateEs256kKeyPair();
      const updateOperationData = await OperationGenerator.generateUpdateOperation(
        'EiBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', updatePublicKey, updatePrivateKey
      );
      const updateOperation = updateOperationData.updateOperation;

      const chunkFileHash = OperationGenerator.generateRandomHash();
      const provisionalProofFileHash = OperationGenerator.generateRandomHash();

      const mapFileBuffer = await MapFile.createBuffer(chunkFileHash, provisionalProofFileHash, [updateOperation]);
      const mapFile = await MapFile.parse(mapFileBuffer);

      const mockProvisionalProofFileBuffer = await ProvisionalProofFile.createBuffer([updateOperation, updateOperation]); // Intentionally having 2 proofs.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockProvisionalProofFileBuffer));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyProvisionalProofFile'](mapFile),
        ErrorCode.ProvisionalProofFileProofCountNotTheSameAsOperationCountInMapFile
      );
    });
  });

  describe('downloadAndVerifyChunkFile', () => {
    it('should return undefined if no map file is given.', async (done) => {
      const mapFileModel = undefined;
      const fetchedChunkFileModel = await transactionProcessor['downloadAndVerifyChunkFile'](mapFileModel);

      expect(fetchedChunkFileModel).toBeUndefined();
      done();
    });

    it('should return undefined if unexpected error caught.', async (done) => {
      const anyHash = OperationGenerator.generateRandomHash();
      const mapFileBuffer = await MapFile.createBuffer(anyHash, anyHash, []);
      const mapFileModel = await MapFile.parse(mapFileBuffer);

      // Mocking an unexpected error thrown.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.throwError('Any unexpected error.');

      const fetchedMapFile = await transactionProcessor['downloadAndVerifyChunkFile'](mapFileModel);

      expect(fetchedMapFile).toBeUndefined();
      done();
    });

    it('should throw if a network related error is caught.', async (done) => {
      const anyHash = OperationGenerator.generateRandomHash();
      const mapFileBuffer = await MapFile.createBuffer(anyHash, anyHash, []);
      const mapFileModel = await MapFile.parse(mapFileBuffer);

      // Mocking a non-network related known error thrown.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.callFake(
        () => { throw new SidetreeError(ErrorCode.CasNotReachable); }
      );

      await expectAsync(transactionProcessor['downloadAndVerifyChunkFile'](mapFileModel))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CasNotReachable));

      done();
    });

    it('should return undefined if non-network related known error is caught.', async (done) => {
      const anyHash = OperationGenerator.generateRandomHash();
      const mapFileBuffer = await MapFile.createBuffer(anyHash, anyHash, []);
      const mapFileModel = await MapFile.parse(mapFileBuffer);

      // Mocking a non-network related known error thrown.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.callFake(
        () => { throw new SidetreeError(ErrorCode.CasFileTooLarge); }
      );

      const fetchedMapFile = await transactionProcessor['downloadAndVerifyChunkFile'](mapFileModel);

      expect(fetchedMapFile).toBeUndefined();
      done();
    });
  });

  describe('composeAnchoredOperationModels', () => {
    it('should compose operations successfully given valid anchor, map, and chunk files.', async (done) => {
      // Create `TransactionModel`.
      const transactionModel: TransactionModel = {
        anchorString: 'anything',
        normalizedTransactionFee: 999,
        transactionFeePaid: 9999,
        transactionNumber: 1,
        transactionTime: 1,
        transactionTimeHash: 'anyValue',
        writer: 'anyWriter'
      };

      // Create anchor file with 1 create and 1 recover operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: OperationGenerator.generateRandomHash(),
        recoveryPrivateKey
      });
      const recoverOperation = recoverOperationData.recoverOperation;
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = OperationGenerator.generateRandomHash();
      const anchorFileBuffer =
        await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [createOperation], [recoverOperation], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Create map file model with 1 update operation.
      const provisionalProofFileHash = OperationGenerator.generateRandomHash();
      const updateOperationRequestData = await OperationGenerator.generateUpdateOperationRequest();
      const updateOperation = updateOperationRequestData.updateOperation;
      const chunkFileHash = OperationGenerator.generateRandomHash();
      const mapFileBuffer = await MapFile.createBuffer(chunkFileHash, provisionalProofFileHash, [updateOperation]);
      const mapFile = await MapFile.parse(mapFileBuffer);

      // Create core and provisional proof file.
      const coreProofFile = await FileGenerator.createCoreProofFile([recoverOperation], []);
      const provisionalProofFile = await FileGenerator.createProvisionalProofFile([updateOperation]);

      // Create chunk file model with delta for the 3 operations created above.
      const chunkFileBuffer = await ChunkFile.createBuffer([createOperation], [recoverOperation], [updateOperation]);
      const chunkFileModel = await ChunkFile.parse(chunkFileBuffer);

      const anchoredOperationModels = await transactionProcessor['composeAnchoredOperationModels'](
        transactionModel, anchorFile, mapFile, coreProofFile, provisionalProofFile, chunkFileModel
      );

      expect(anchoredOperationModels.length).toEqual(3);
      expect(anchoredOperationModels[0].didUniqueSuffix).toEqual(createOperation.didUniqueSuffix);
      expect(anchoredOperationModels[0].operationIndex).toEqual(0);
      expect(anchoredOperationModels[0].transactionTime).toEqual(1);
      expect(anchoredOperationModels[1].didUniqueSuffix).toEqual(recoverOperation.didUniqueSuffix);
      expect(anchoredOperationModels[1].operationIndex).toEqual(1);
      expect(anchoredOperationModels[2].didUniqueSuffix).toEqual(updateOperation.didUniqueSuffix);
      expect(anchoredOperationModels[2].operationIndex).toEqual(2);
      done();
    });

    it('should compose operations successfully given valid anchor file, but no map and chunk files.', async (done) => {
      // Create `TransactionModel`.
      const transactionModel: TransactionModel = {
        anchorString: 'anything',
        normalizedTransactionFee: 999,
        transactionFeePaid: 9999,
        transactionNumber: 1,
        transactionTime: 1,
        transactionTimeHash: 'anyValue',
        writer: 'anyWriter'
      };

      // Create anchor file with 1 create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = undefined;
      const anchorFileBuffer = await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [createOperation], [], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      const anchoredOperationModels = await transactionProcessor['composeAnchoredOperationModels'](transactionModel, anchorFile, undefined, undefined, undefined, undefined);

      expect(anchoredOperationModels.length).toEqual(1);
      expect(anchoredOperationModels[0].didUniqueSuffix).toEqual(createOperation.didUniqueSuffix);
      expect(anchoredOperationModels[0].operationIndex).toEqual(0);
      expect(anchoredOperationModels[0].transactionTime).toEqual(1);
      done();
    });

    it('[Bug #820] should populate operation buffer for deactivate operations.', async (done) => {
      // Create `TransactionModel`.
      const transactionModel: TransactionModel = {
        anchorString: 'anything',
        normalizedTransactionFee: 999,
        transactionFeePaid: 9999,
        transactionNumber: 1,
        transactionTime: 1,
        transactionTimeHash: 'anyValue',
        writer: 'anyWriter'
      };

      // Create anchor file with 1 deactivate operation.
      const anyDidUniqueSuffix = OperationGenerator.generateRandomHash();
      const [, anyPrivateKey] = await OperationGenerator.generateKeyPair('anyKeyId');
      const deactivateOperationData = await OperationGenerator.createDeactivateOperation(anyDidUniqueSuffix, anyPrivateKey);
      const deactivateOperation = deactivateOperationData.deactivateOperation;
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = OperationGenerator.generateRandomHash();
      const anchorFileBuffer = await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [], [], [deactivateOperation]);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Construct the core proof file to go with the deactivate operation.
      const coreProofFile = await FileGenerator.createCoreProofFile([], [deactivateOperation]);
      const anchoredOperationModels = await transactionProcessor['composeAnchoredOperationModels'](
        transactionModel, anchorFile, undefined, coreProofFile, undefined, undefined
      );

      const returnedOperation = await Operation.parse(anchoredOperationModels[0].operationBuffer);
      expect(returnedOperation.didUniqueSuffix).toEqual(deactivateOperation.didUniqueSuffix);
      expect(returnedOperation.operationBuffer.length).toBeGreaterThan(0);
      done();
    });

    it('should succeed with deltas being set to `undefined` if chunk file is not given.', async () => {
      // Mock a transaction model.
      const transactionModel: TransactionModel = {
        anchorString: 'anything',
        normalizedTransactionFee: 999,
        transactionFeePaid: 9999,
        transactionNumber: 1,
        transactionTime: 1,
        transactionTimeHash: 'anyValue',
        writer: 'anyWriter'
      };

      // Mock core index file with a recovery.
      const [, anyPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation(
        { didUniqueSuffix: OperationGenerator.generateRandomHash(), recoveryPrivateKey: anyPrivateKey }
      );
      const recoverOperation = recoverOperationData.recoverOperation;
      const mapFileHash = OperationGenerator.generateRandomHash();
      const coreProofFileHash = OperationGenerator.generateRandomHash();
      const anchorFileBuffer = await AnchorFile.createBuffer('writerLockId', mapFileHash, coreProofFileHash, [], [recoverOperation], []);
      const anchorFile = await AnchorFile.parse(anchorFileBuffer);

      // Mock a provisional index file with an update.
      const provisionalProofFileHash = OperationGenerator.generateRandomHash();
      const updateOperationRequestData = await OperationGenerator.generateUpdateOperationRequest();
      const updateOperation = updateOperationRequestData.updateOperation;
      const chunkFileHash = OperationGenerator.generateRandomHash();
      const mapFileBuffer = await MapFile.createBuffer(chunkFileHash, provisionalProofFileHash, [updateOperation]);
      const mapFile = await MapFile.parse(mapFileBuffer);

      // Create core and provisional proof file.
      const coreProofFile = await FileGenerator.createCoreProofFile([recoverOperation], []);
      const provisionalProofFile = await FileGenerator.createProvisionalProofFile([updateOperation]);

      const anchoredOperationModels = await transactionProcessor['composeAnchoredOperationModels'](
        transactionModel, anchorFile, mapFile, coreProofFile, provisionalProofFile, undefined
      );

      expect(anchoredOperationModels.length).toEqual(2);

      const composedRecoverRequest = JSON.parse(anchoredOperationModels[0].operationBuffer.toString());
      const composedUpdateRequest = JSON.parse(anchoredOperationModels[1].operationBuffer.toString());

      expect(composedRecoverRequest.didSuffix).toEqual(recoverOperation.didUniqueSuffix);
      expect(composedUpdateRequest.didSuffix).toEqual(updateOperation.didUniqueSuffix);
      expect(composedRecoverRequest.delta).toBeUndefined();
      expect(composedUpdateRequest.delta).toBeUndefined();
    });
  });
});
