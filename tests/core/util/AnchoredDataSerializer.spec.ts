import AnchoredData from '../../../lib/core/versions/latest/models/AnchoredData';
import AnchoredDataSerializer from '../../../lib/core/versions/latest/AnchoredDataSerializer';
import ErrorCode from '../../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';

describe('AnchoredDataSerializer', async () => {

  const maxNumberOfOperationsAllowed = 0xFFFFFFFF; // max unint32 value
  let testDataToWrite: AnchoredData;

  beforeEach(async () => {

    testDataToWrite = {
      anchorFileHash: 'random data to write',
      numberOfOperations: 10000
    };
  });

  it('should serialize & deserialize correctly.', async () => {

    const serialized = AnchoredDataSerializer.serialize(testDataToWrite);
    const deserialized = AnchoredDataSerializer.deserialize(serialized);

    expect(deserialized.anchorFileHash).toEqual(testDataToWrite.anchorFileHash);
    expect(deserialized.numberOfOperations).toEqual(testDataToWrite.numberOfOperations);
  });

  it('should serialize & deserialize the min number of operations correctly', async () => {
    testDataToWrite.numberOfOperations = 0;
    const serialized = AnchoredDataSerializer.serialize(testDataToWrite);
    const deserialized = AnchoredDataSerializer.deserialize(serialized);

    expect(deserialized.anchorFileHash).toEqual(testDataToWrite.anchorFileHash);
    expect(deserialized.numberOfOperations).toEqual(testDataToWrite.numberOfOperations);
  });

  it('should serialize & deserialize the max number of operations correctly', async () => {
    testDataToWrite.numberOfOperations = maxNumberOfOperationsAllowed;
    const serialized = AnchoredDataSerializer.serialize(testDataToWrite);
    const deserialized = AnchoredDataSerializer.deserialize(serialized);

    expect(deserialized.anchorFileHash).toEqual(testDataToWrite.anchorFileHash);
    expect(deserialized.numberOfOperations).toEqual(testDataToWrite.numberOfOperations);
  });

  it('should throw if the number of ops are not within range', async () => {

    testDataToWrite.numberOfOperations = -1;
    JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
      () => AnchoredDataSerializer.serialize(testDataToWrite),
      ErrorCode.AnchoredDataNumberOfOperationsLessThanZero);

    testDataToWrite.numberOfOperations = maxNumberOfOperationsAllowed + 1;
    JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
      () => AnchoredDataSerializer.serialize(testDataToWrite),
      ErrorCode.AnchoredDataNumberOfOperationsGreaterThanMax);
  });

  it('should throw if the number of ops is not an integer', async () => {

    testDataToWrite.numberOfOperations = 101.2;
    JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
      () => AnchoredDataSerializer.serialize(testDataToWrite),
      ErrorCode.AnchoredDataNumberOfOperationsNotInteger);
  });

  it('deserialize should throw if the input is not in the correct format.', async () => {

    // Input doesn't have any delimeter
    JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
      () => AnchoredDataSerializer.deserialize('SOMEINVALIDDATA'),
      ErrorCode.AnchoredDataIncorrectFormat);
  });

  describe('convertBufferToNumber', async () => {

    it('should convert the buffer to number correctly', async () => {
      const number = 109939;
      const buffer = Buffer.alloc(4);
      buffer.writeUInt32LE(number, 0);

      const actual = AnchoredDataSerializer['convertBufferToNumber'](buffer);
      expect(actual).toEqual(number);
    });

    it('should return an error if the buffer size is not correct', async () => {

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => AnchoredDataSerializer['convertBufferToNumber'](Buffer.alloc(2)),
        ErrorCode.AnchoredDataNumberOfOperationsNotFourBytes);
    });
  });
});
