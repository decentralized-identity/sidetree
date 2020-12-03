import AnchoredData from '../../../lib/core/versions/latest/models/AnchoredData';
import AnchoredDataSerializer from '../../../lib/core/versions/latest/AnchoredDataSerializer';
import ErrorCode from '../../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';

describe('AnchoredDataSerializer', async () => {

  let testDataToWrite: AnchoredData;

  beforeEach(async () => {

    testDataToWrite = {
      coreIndexFileUri: 'random data to write',
      numberOfOperations: 10000
    };
  });

  it('should serialize & deserialize correctly.', async () => {

    const serialized = AnchoredDataSerializer.serialize(testDataToWrite);
    const deserialized = AnchoredDataSerializer.deserialize(serialized);

    expect(deserialized.coreIndexFileUri).toEqual(testDataToWrite.coreIndexFileUri);
    expect(deserialized.numberOfOperations).toEqual(testDataToWrite.numberOfOperations);
  });

  describe(`deserialize()`, () => {
    it('deserialize should throw if the input is not in the correct format.', async () => {

      // Input doesn't have any delimeter
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => AnchoredDataSerializer.deserialize('SOMEINVALIDDATA'),
        ErrorCode.AnchoredDataIncorrectFormat);
    });

    it('should throw if the number of operations is not a number.', async () => {
      // Set operation number portion to `abc`.
      const anchorString = `abc${AnchoredDataSerializer.delimiter}unusedCoreIndexFileUri`;
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => AnchoredDataSerializer.deserialize(anchorString),
        ErrorCode.AnchoredDataNumberOfOperationsNotPositiveInteger);
    });

    it('should throw if the number of operations is not a positive integer.', async () => {
      // Set operation number portion to 0;
      const anchorString = `0${AnchoredDataSerializer.delimiter}unusedCoreIndexFileUri`;
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => AnchoredDataSerializer.deserialize(anchorString),
        ErrorCode.AnchoredDataNumberOfOperationsNotPositiveInteger);
    });

    it('should throw if the number of operations exceeds max allowed.', async () => {
      // Go over max allowed batch size by one.
      const anchorString = `10001${AnchoredDataSerializer.delimiter}unusedCoreIndexFileUri`;
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => AnchoredDataSerializer.deserialize(anchorString),
        ErrorCode.AnchoredDataNumberOfOperationsGreaterThanMax);
    });
  });
});
