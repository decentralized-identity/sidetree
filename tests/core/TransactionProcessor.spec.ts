import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';
import ChunkFile from '../../lib/core/versions/latest/ChunkFile';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import CoreIndexFile from '../../lib/core/versions/latest/CoreIndexFile';
import CoreIndexFileModel from '../../lib/core/versions/latest/models/CoreIndexFileModel';
import CoreProofFile from '../../lib/core/versions/latest/CoreProofFile';
import DownloadManager from '../../lib/core/DownloadManager';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import FeeManager from '../../lib/core/versions/latest/FeeManager';
import FetchResult from '../../lib/common/models/FetchResult';
import FetchResultCode from '../../lib/common/enums/FetchResultCode';
import FileGenerator from '../generators/FileGenerator';
import IBlockchain from '../../lib/core/interfaces/IBlockchain';
import Ipfs from '../../lib/ipfs/Ipfs';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import MockBlockchain from '../mocks/MockBlockchain';
import MockOperationStore from '../mocks/MockOperationStore';
import OperationGenerator from '../generators/OperationGenerator';
import ProvisionalIndexFile from '../../lib/core/versions/latest/ProvisionalIndexFile';
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
      const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: '1stTransaction', numberOfOperations: 0 });
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

    it('should return true if core index file hash is not valid', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.InvalidHash };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: '1stTransaction', numberOfOperations: 1 });
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
      const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: '1stTransaction', numberOfOperations: 1 });
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
      const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: '1stTransaction', numberOfOperations: 1 });
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
      const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: '1stTransaction', numberOfOperations: 1 });
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
      const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: '1stTransaction', numberOfOperations: 1 });
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
      const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: '1stTransaction', numberOfOperations: 1 });
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

    it('should continue to compose the operations and return false if unexpected error is thrown when downloading provisional index file.', async () => {
      spyOn(FeeManager, 'verifyTransactionFeeAndThrowOnError');
      spyOn(transactionProcessor as any, 'downloadAndVerifyCoreIndexFile').and.returnValue('unused');
      spyOn(transactionProcessor as any, 'downloadAndVerifyCoreProofFile');
      spyOn(transactionProcessor as any, 'downloadAndVerifyProvisionalIndexFile').and.throwError('any unexpected error');
      const composeAnchoredOperationModelsSpy = spyOn(transactionProcessor as any, 'composeAnchoredOperationModels').and.returnValue([]);
      const operationStoreSpy = spyOn(operationStore, 'insertOrReplace');

      const anyTransactionModel = OperationGenerator.generateTransactionModel();
      const transactionProcessedCompletely = await transactionProcessor.processTransaction(anyTransactionModel);
      expect(composeAnchoredOperationModelsSpy).toHaveBeenCalled();
      expect(operationStoreSpy).toHaveBeenCalled();
      expect(transactionProcessedCompletely).toBeFalsy();
    });

    it('should continue to compose the operations and return false if network error is thrown when downloading provisional index file.', async () => {
      spyOn(FeeManager, 'verifyTransactionFeeAndThrowOnError');
      spyOn(transactionProcessor as any, 'downloadAndVerifyCoreIndexFile').and.returnValue('unused');
      spyOn(transactionProcessor as any, 'downloadAndVerifyCoreProofFile');
      spyOn(transactionProcessor as any, 'downloadAndVerifyProvisionalIndexFile').and.callFake(() => { throw new SidetreeError(ErrorCode.CasFileNotFound); });
      const composeAnchoredOperationModelsSpy = spyOn(transactionProcessor as any, 'composeAnchoredOperationModels').and.returnValue([]);
      const operationStoreSpy = spyOn(operationStore, 'insertOrReplace');

      const anyTransactionModel = OperationGenerator.generateTransactionModel();
      const transactionProcessedCompletely = await transactionProcessor.processTransaction(anyTransactionModel);
      expect(composeAnchoredOperationModelsSpy).toHaveBeenCalled();
      expect(operationStoreSpy).toHaveBeenCalled();
      expect(transactionProcessedCompletely).toBeFalsy();
    });

    it('should continue to compose the operations and return true if non-network Sidetree error is thrown when downloading provisional index file.', async () => {
      spyOn(FeeManager, 'verifyTransactionFeeAndThrowOnError');
      spyOn(transactionProcessor as any, 'downloadAndVerifyCoreIndexFile').and.returnValue('unused');
      spyOn(transactionProcessor as any, 'downloadAndVerifyCoreProofFile');
      spyOn(transactionProcessor as any, 'downloadAndVerifyProvisionalIndexFile').and.callFake(() => { throw new SidetreeError(ErrorCode.ChunkFileDeltasNotArrayOfObjects); });
      const composeAnchoredOperationModelsSpy = spyOn(transactionProcessor as any, 'composeAnchoredOperationModels').and.returnValue([]);
      const operationStoreSpy = spyOn(operationStore, 'insertOrReplace');

      const anyTransactionModel = OperationGenerator.generateTransactionModel();
      const transactionProcessedCompletely = await transactionProcessor.processTransaction(anyTransactionModel);
      expect(composeAnchoredOperationModelsSpy).toHaveBeenCalled();
      expect(operationStoreSpy).toHaveBeenCalled();
      expect(transactionProcessedCompletely).toBeTruthy();
    });
  });

  describe('downloadAndVerifyCoreIndexFile', () => {
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
        () => transactionProcessor['downloadAndVerifyCoreIndexFile'](mockTransaction, 'mock_hash', 999999), // Some really large paid operation count.
        ErrorCode.TransactionProcessorPaidOperationCountExceedsLimit);

      done();
    });

    it('should throw if operation count in core index file exceeded the paid limit.', async (done) => {
      const createOperation1 = (await OperationGenerator.generateCreateOperation()).createOperation;
      const createOperation2 = (await OperationGenerator.generateCreateOperation()).createOperation;
      const anyHash = OperationGenerator.generateRandomHash();
      const mockCoreIndexFileModel = await CoreIndexFile.createModel('writerLockId', anyHash, undefined, [createOperation1, createOperation2], [], []);
      const mockCoreIndexFileBuffer = await Compressor.compress(Buffer.from(JSON.stringify(mockCoreIndexFileModel)));

      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockCoreIndexFileBuffer));

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
        () => transactionProcessor['downloadAndVerifyCoreIndexFile'](mockTransaction, 'mock_hash', 1),
        ErrorCode.CoreIndexFileOperationCountExceededPaidLimit);

      done();
    });

    it('should bubble up any errors thrown by verify lock routine', async (done) => {
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(Buffer.from('value')));

      const mockCoreIndexFile: CoreIndexFile = {
        createDidSuffixes: [],
        didUniqueSuffixes: ['abc', 'def'],
        model: { writerLockId: 'lock', provisionalIndexFileUri: 'map_hash', operations: {} },
        recoverDidSuffixes: [],
        deactivateDidSuffixes: []
      };
      spyOn(CoreIndexFile, 'parse').and.returnValue(Promise.resolve(mockCoreIndexFile));

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
        () => transactionProcessor['downloadAndVerifyCoreIndexFile'](mockTransaction, 'anchor_hash', paidOperationCount),
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
      const mockCoreIndexFileModel = await CoreIndexFile.createModel(undefined, anyHash, undefined, [createOperationData.createOperation], [], []);
      const mockCoreIndexFileBuffer = await Compressor.compress(Buffer.from(JSON.stringify(mockCoreIndexFileModel)));

      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockCoreIndexFileBuffer));
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
      const downloadedCoreIndexFile = await transactionProcessor['downloadAndVerifyCoreIndexFile'](mockTransaction, 'mock_hash', paidBatchSize);
      expect(JSON.stringify(downloadedCoreIndexFile.model)).toEqual(JSON.stringify(mockCoreIndexFileModel));
      done();
    });
  });

  describe('downloadAndVerifyProvisionalIndexFile', () => {
    it('should validate a valid provisional index file for the case that it does not have the `operations` property.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const provisionalIndexFileUri = OperationGenerator.generateRandomHash();
      const coreProofFileUri = undefined;
      const coreIndexFileBuffer =
      await CoreIndexFile.createBuffer('writerLockId', provisionalIndexFileUri, coreProofFileUri, [createOperationData.createOperation], [], []);
      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      // Setting up a mock provisional index file that has 1 update in it to be downloaded.
      const provisionalProofFileUri = undefined;
      const chunkFileUri = OperationGenerator.generateRandomHash();
      const mockProvisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(chunkFileUri, provisionalProofFileUri, []);
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockProvisionalIndexFileBuffer));

      // Setting the total paid operation count to be 1 (needs to be at least 2 in success case).
      const totalPaidOperationCount = 1;
      const fetchedProvisionalIndexFile = await transactionProcessor['downloadAndVerifyProvisionalIndexFile'](coreIndexFile, totalPaidOperationCount);

      expect(fetchedProvisionalIndexFile).toBeDefined();
      expect(fetchedProvisionalIndexFile!.didUniqueSuffixes.length).toEqual(0);
      expect(fetchedProvisionalIndexFile!.model.chunks[0].chunkFileUri).toEqual(chunkFileUri);
      done();
    });

    it('should throw if update operation count is greater than the max paid update operation count.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const provisionalIndexFileUri = OperationGenerator.generateRandomHash();
      const coreProofFileUri = undefined;
      const coreIndexFileBuffer =
        await CoreIndexFile.createBuffer('writerLockId', provisionalIndexFileUri, coreProofFileUri, [createOperationData.createOperation], [], []);
      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      // Setting up a mock provisional index file that has 1 update in it to be downloaded.
      const provisionalProofFileUri = OperationGenerator.generateRandomHash();
      const updateOperationRequestData = await OperationGenerator.generateUpdateOperationRequest();
      const chunkFileUri = OperationGenerator.generateRandomHash();
      const mockProvisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(
        chunkFileUri, provisionalProofFileUri, [updateOperationRequestData.updateOperation]
      );
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockProvisionalIndexFileBuffer));

      // Setting the total paid operation count to be 1 (needs to be at least 2 in success case).
      const totalPaidOperationCount = 1;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyProvisionalIndexFile'](coreIndexFile, totalPaidOperationCount),
        ErrorCode.ProvisionalIndexFileUpdateOperationCountGreaterThanMaxPaidCount
      );
    });

    it('should return undefined if core index file does not contain the provisional index file URI.', async () => {
      const deactivateDidSuffix = OperationGenerator.generateRandomHash();
      const coreIndexFileModel: CoreIndexFileModel = {
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
      const coreIndexFile = new (CoreIndexFile as any)(coreIndexFileModel, [deactivateDidSuffix], [], [], [deactivateDidSuffix]);

      // Setting the total paid operation count to be 1 (needs to be at least 2 in success case).
      const totalPaidOperationCount = 1;
      const fetchedProvisionalIndexFile = await transactionProcessor['downloadAndVerifyProvisionalIndexFile'](coreIndexFile, totalPaidOperationCount);

      expect(fetchedProvisionalIndexFile).toBeUndefined();
    });

    it('should throw if there is a duplicate DID between core and provisional index file.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const provisionalIndexFileUri = OperationGenerator.generateRandomHash();
      const coreProofFileUri = undefined;
      const coreIndexFileBuffer =
      await CoreIndexFile.createBuffer('writerLockId', provisionalIndexFileUri, coreProofFileUri, [createOperationData.createOperation], [], []);
      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      // Setting up a mock provisional index file that has 1 update in it to be downloaded.
      const provisionalProofFileUri = OperationGenerator.generateRandomHash();
      const updateOperationRequestData = await OperationGenerator.generateUpdateOperationRequest(createOperationData.createOperation.didUniqueSuffix);
      const chunkFileUri = OperationGenerator.generateRandomHash();
      const mockProvisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(
        chunkFileUri, provisionalProofFileUri, [updateOperationRequestData.updateOperation]
      );
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockProvisionalIndexFileBuffer));

      const totalPaidOperationCount = 10;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyProvisionalIndexFile'](coreIndexFile, totalPaidOperationCount),
        ErrorCode.ProvisionalIndexFileDidReferenceDuplicatedWithCoreIndexFile
      );
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

      const provisionalIndexFileUri = OperationGenerator.generateRandomHash();
      const coreProofFileUri = OperationGenerator.generateRandomHash();
      const coreIndexFileBuffer = await CoreIndexFile.createBuffer(
        'writerLockId', provisionalIndexFileUri, coreProofFileUri, [createOperation], [recoverOperation], [deactivateOperation]
      );
      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      const mockCoreProofFileBuffer = await CoreProofFile.createBuffer([recoverOperation], [deactivateOperation]);
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockCoreProofFileBuffer));

      const actualProcessedCoreProofFile = await transactionProcessor['downloadAndVerifyCoreProofFile'](coreIndexFile);
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

      const provisionalIndexFileUri = OperationGenerator.generateRandomHash();
      const coreProofFileUri = OperationGenerator.generateRandomHash();
      const coreIndexFileBuffer = await CoreIndexFile.createBuffer(
        'writerLockId', provisionalIndexFileUri, coreProofFileUri, [], [recoverOperation], [deactivateOperation]
      );
      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      const mockCoreProofFileBuffer = await CoreProofFile.createBuffer([recoverOperation], []); // Intentionally missing proofs for deactivate.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockCoreProofFileBuffer));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyCoreProofFile'](coreIndexFile),
        ErrorCode.CoreProofFileProofCountNotTheSameAsOperationCountInCoreIndexFile
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

      const chunkFileUri = OperationGenerator.generateRandomHash();
      const provisionalProofFileUri = OperationGenerator.generateRandomHash();

      const provisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(chunkFileUri, provisionalProofFileUri, [updateOperation]);
      const provisionalIndexFile = await ProvisionalIndexFile.parse(provisionalIndexFileBuffer);

      const mockProvisionalProofFileBuffer = await ProvisionalProofFile.createBuffer([updateOperation]);
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockProvisionalProofFileBuffer));

      const actualProcessedProvisionalProofFile = await transactionProcessor['downloadAndVerifyProvisionalProofFile'](provisionalIndexFile);
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

      const chunkFileUri = OperationGenerator.generateRandomHash();
      const provisionalProofFileUri = OperationGenerator.generateRandomHash();

      const provisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(chunkFileUri, provisionalProofFileUri, [updateOperation]);
      const provisionalIndexFile = await ProvisionalIndexFile.parse(provisionalIndexFileBuffer);

      const mockProvisionalProofFileBuffer = await ProvisionalProofFile.createBuffer([updateOperation, updateOperation]); // Intentionally having 2 proofs.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockProvisionalProofFileBuffer));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyProvisionalProofFile'](provisionalIndexFile),
        ErrorCode.ProvisionalProofFileProofCountNotTheSameAsOperationCountInProvisionalIndexFile
      );
    });
  });

  describe('downloadAndVerifyChunkFile', () => {
    it('should return undefined if no provisional index file is given.', async (done) => {
      const coreIndexFile = await FileGenerator.generateCoreIndexFile();
      const provisionalIndexFile = undefined;
      const fetchedChunkFileModel = await transactionProcessor['downloadAndVerifyChunkFile'](coreIndexFile, provisionalIndexFile);

      expect(fetchedChunkFileModel).toBeUndefined();
      done();
    });

    it('should throw if the delta count is different to the count of operations with delta in core and provisional index file.', async () => {
      // Combination of count of operations with delta in core and provisional index files will be greater than 1.
      const coreIndexFile = await FileGenerator.generateCoreIndexFile();
      const provisionalIndexFile = await FileGenerator.generateProvisionalIndexFile();

      const mockCreateOperationData = await OperationGenerator.generateCreateOperation();
      const mockChunkFileBuffer = await ChunkFile.createBuffer([mockCreateOperationData.createOperation], [], []); // This creates delta array length of 1.
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockChunkFileBuffer));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyChunkFile'](coreIndexFile, provisionalIndexFile),
        ErrorCode.ChunkFileDeltaCountIncorrect
      );
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

      // Create core index file with 1 create, 1 recover operation and 1 deactivate.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: OperationGenerator.generateRandomHash(),
        recoveryPrivateKey
      });
      const recoverOperation = recoverOperationData.recoverOperation;

      const deactivateDidUniqueSuffix = OperationGenerator.generateRandomHash();
      const [, deactivatePrivateKey] = await OperationGenerator.generateKeyPair('anyKeyId');
      const deactivateOperationData = await OperationGenerator.createDeactivateOperation(deactivateDidUniqueSuffix, deactivatePrivateKey);
      const deactivateOperation = deactivateOperationData.deactivateOperation;

      const provisionalIndexFileUri = OperationGenerator.generateRandomHash();
      const coreProofFileUri = OperationGenerator.generateRandomHash();
      const coreIndexFileBuffer =
        await CoreIndexFile.createBuffer('writerLockId', provisionalIndexFileUri, coreProofFileUri, [createOperation], [recoverOperation], [deactivateOperation]);
      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      // Create provisional index file model with 1 update operation.
      const provisionalProofFileUri = OperationGenerator.generateRandomHash();
      const updateOperationRequestData = await OperationGenerator.generateUpdateOperationRequest();
      const updateOperation = updateOperationRequestData.updateOperation;
      const chunkFileUri = OperationGenerator.generateRandomHash();
      const provisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(chunkFileUri, provisionalProofFileUri, [updateOperation]);
      const provisionalIndexFile = await ProvisionalIndexFile.parse(provisionalIndexFileBuffer);

      // Create core and provisional proof file.
      const coreProofFile = await FileGenerator.createCoreProofFile([recoverOperation], [deactivateOperation]);
      const provisionalProofFile = await FileGenerator.createProvisionalProofFile([updateOperation]);

      // Create chunk file model with delta for the create, recover and update operations.
      const chunkFileBuffer = await ChunkFile.createBuffer([createOperation], [recoverOperation], [updateOperation]);
      const chunkFileModel = await ChunkFile.parse(chunkFileBuffer!);

      const anchoredOperationModels = await transactionProcessor['composeAnchoredOperationModels'](
        transactionModel, coreIndexFile, provisionalIndexFile, coreProofFile, provisionalProofFile, chunkFileModel
      );

      expect(anchoredOperationModels.length).toEqual(4);
      expect(anchoredOperationModels[0].didUniqueSuffix).toEqual(createOperation.didUniqueSuffix);
      expect(anchoredOperationModels[0].operationIndex).toEqual(0);
      expect(anchoredOperationModels[0].transactionTime).toEqual(1);
      expect(anchoredOperationModels[1].didUniqueSuffix).toEqual(recoverOperation.didUniqueSuffix);
      expect(anchoredOperationModels[1].operationIndex).toEqual(1);
      expect(anchoredOperationModels[2].didUniqueSuffix).toEqual(deactivateOperation.didUniqueSuffix);
      expect(anchoredOperationModels[2].operationIndex).toEqual(2);
      expect(anchoredOperationModels[3].didUniqueSuffix).toEqual(updateOperation.didUniqueSuffix);
      expect(anchoredOperationModels[3].operationIndex).toEqual(3);
      done();
    });

    it('should compose operations successfully given valid core index file, but no map and chunk files.', async (done) => {
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

      // Create core index file with 1 create operation.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;
      const provisionalIndexFileUri = OperationGenerator.generateRandomHash();
      const coreProofFileUri = undefined;
      const coreIndexFileBuffer = await CoreIndexFile.createBuffer('writerLockId', provisionalIndexFileUri, coreProofFileUri, [createOperation], [], []);
      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      const anchoredOperationModels = await transactionProcessor['composeAnchoredOperationModels'](transactionModel, coreIndexFile, undefined, undefined, undefined, undefined);

      expect(anchoredOperationModels.length).toEqual(1);
      expect(anchoredOperationModels[0].didUniqueSuffix).toEqual(createOperation.didUniqueSuffix);
      expect(anchoredOperationModels[0].operationIndex).toEqual(0);
      expect(anchoredOperationModels[0].transactionTime).toEqual(1);
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
      const provisionalIndexFileUri = OperationGenerator.generateRandomHash();
      const coreProofFileUri = OperationGenerator.generateRandomHash();
      const coreIndexFileBuffer = await CoreIndexFile.createBuffer('writerLockId', provisionalIndexFileUri, coreProofFileUri, [], [recoverOperation], []);
      const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

      // Mock a provisional index file with an update.
      const provisionalProofFileUri = OperationGenerator.generateRandomHash();
      const updateOperationRequestData = await OperationGenerator.generateUpdateOperationRequest();
      const updateOperation = updateOperationRequestData.updateOperation;
      const chunkFileUri = OperationGenerator.generateRandomHash();
      const provisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(chunkFileUri, provisionalProofFileUri, [updateOperation]);
      const provisionalIndexFile = await ProvisionalIndexFile.parse(provisionalIndexFileBuffer);

      // Create core and provisional proof file.
      const coreProofFile = await FileGenerator.createCoreProofFile([recoverOperation], []);
      const provisionalProofFile = await FileGenerator.createProvisionalProofFile([updateOperation]);

      const anchoredOperationModels = await transactionProcessor['composeAnchoredOperationModels'](
        transactionModel, coreIndexFile, provisionalIndexFile, coreProofFile, provisionalProofFile, undefined
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
