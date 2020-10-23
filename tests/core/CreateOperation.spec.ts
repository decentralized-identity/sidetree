import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/common/SidetreeError';
import * as generatedFixtures from '../vectors/generated.json';

describe('CreateOperation', async () => {
  describe('parseJcsObject', () => {
    it('should leave delta as empty if it is not valid', () => {
      const operationObject = {
        type: 'create',
        suffixData: {
          deltaHash: 'something',
          recoveryCommitment: 'something',
          type: 'type'
        },
        delta: 'this is not a valid delta'
      };

      spyOn(CreateOperation as any, 'validateSuffixData').and.callFake(() => {
        // do nothing
      });

      const result = CreateOperation.parseJcsObject(operationObject, Buffer.from('something'), false);
      expect(result.delta).toBeUndefined();
    });

    it('should process as anchor file mode when anchorFileMode is true', () => {
      const operationObject = {
        suffixData: {
          deltaHash: 'something',
          recoveryCommitment: 'something',
          type: 'type'
        }
      };

      spyOn(CreateOperation as any, 'validateSuffixData').and.callFake(() => {
        // do nothing
      });

      const result = CreateOperation.parseJcsObject(operationObject, Buffer.from('something'), true);
      expect(result.delta).toBeUndefined();
      expect(result.suffixData).toBeDefined();
    });

    it('should throw sidetree error if object contains more or less than 3 properties', () => {
      const twoProperties = { one: 1, two: 2 };
      const fourProperties = { one: 1, two: 2, three: 3, four: 4 };

      try {
        CreateOperation.parseJcsObject(twoProperties, Buffer.from(JSON.stringify(twoProperties)), false);
        fail('expect to throw sidetree error but did not');
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty));
      }

      try {
        CreateOperation.parseJcsObject(fourProperties, Buffer.from(JSON.stringify(fourProperties)), false);
        fail('expect to throw sidetree error but did not');
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty));
      }
    });

    it('should throw sidetree error if type is not create', () => {
      const testObject = {
        type: 'notCreate',
        suffixData: {
          deltaHash: 'something',
          recoveryCommitment: 'something',
          type: 'type'
        },
        delta: 'something'
      };

      spyOn(CreateOperation as any, 'validateSuffixData').and.callFake(() => {
        // do nothing
      });

      try {
        CreateOperation.parseJcsObject(testObject, Buffer.from(JSON.stringify(testObject)), false);
        fail('expect to throw sidetree error but did not');
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.CreateOperationTypeIncorrect));
      }
    });

    it('should throw sidetree error if has more or less than 1 property when in anchor file mode', () => {
      const testObject = {
        type: 'this should not exist',
        suffixData: {
          deltaHash: 'something',
          recoveryCommitment: 'something',
          type: 'type'
        }
      };
      try {
        CreateOperation.parseJcsObject(testObject, Buffer.from(JSON.stringify(testObject)), true);
        fail('expect to throw sidetree error but did not');
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty));
      }
    });
  });

  describe('computeJcsDidUniqueSuffix', () => {
    it('should return expected did unique suffix', () => {
      const actual = Multihash.canonicalizeThenHashThenEncode(generatedFixtures.create.createOperation.suffixData);
      expect(actual).toEqual(generatedFixtures.create.didUniqueSuffix);
    });
  });

  describe('computeDidUniqueSuffix()', async () => {
    it('should return expected did unique suffix', async (done) => {
      const suffixDataString = 'AStringActingAsTheSuffixData';
      const encodedSuffixDataString = Encoder.encode(suffixDataString);
      const didUniqueSuffix = (CreateOperation as any).computeDidUniqueSuffix(encodedSuffixDataString);

      const expectedDidUniqueSuffix = 'EiDv9forvDUZq4OQICV5EaU549i1kMxM9Fzczubtd1de2Q';
      expect(didUniqueSuffix).toEqual(expectedDidUniqueSuffix);
      done();
    });
  });

  describe('parse()', async () => {
    it('should throw if create operation request has more than 3 properties.', async () => {
      const [recoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [signingPublicKey] = await OperationGenerator.generateKeyPair('key2');
      const services = OperationGenerator.generateServices(['serviceId123']);
      const createOperationRequest = await OperationGenerator.generateCreateOperationRequest(
        recoveryPublicKey,
        signingPublicKey.publicKeyJwk,
        [signingPublicKey],
        services
      );

      (createOperationRequest as any).extraProperty = 'unknown extra property';

      const createOperationBuffer = Buffer.from(JSON.stringify(createOperationRequest));
      await expectAsync(CreateOperation.parse(createOperationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty));
    });

    it('should throw if operation type is incorrect', async () => {
      const [recoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [signingPublicKey] = await OperationGenerator.generateKeyPair('key2');
      const services = OperationGenerator.generateServices(['serviceId123']);
      const createOperationRequest = await OperationGenerator.generateCreateOperationRequest(
        recoveryPublicKey,
        signingPublicKey.publicKeyJwk,
        [signingPublicKey],
        services
      );

      createOperationRequest.type = OperationType.Deactivate;

      const createOperationBuffer = Buffer.from(JSON.stringify(createOperationRequest));
      await expectAsync(CreateOperation.parse(createOperationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationTypeIncorrect));
    });
  });

  describe('validateSuffixData', () => {
    it('should throw if the input is not an object', () => {
      const input = 'this is not an object, this is a string';
      try {
        CreateOperation['validateSuffixData'](input);
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.CreateOperationSuffixDataIsNotObject));
      }
    });
  });

  describe('parseSuffixData()', async () => {
    // TODO: SIP 2 #781 deprecates this. These tests can be siwtched over to validateSuffixData
    it('should function as expected with type', async () => {
      const suffixData = {
        deltaHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryCommitment: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        type: 'type'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      const result = (CreateOperation as any).parseSuffixData(encodedSuffixData);
      expect(result).toBeDefined();
    });

    it('should function as expected without type', async () => {
      const suffixData = {
        deltaHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryCommitment: Encoder.encode(Multihash.hash(Buffer.from('some one time password')))
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      const result = (CreateOperation as any).parseSuffixData(encodedSuffixData);
      expect(result).toBeDefined();
    });

    it('should throw if suffix data is not string', async () => {
      await expectAsync((CreateOperation as any).parseSuffixData(123))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrNotString));
    });

    it('should throw if suffix data contains an additional unknown property.', async () => {
      const suffixData = {
        deltaHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryCommitment: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        type: 'type',
        extraProperty: 'An unknown extra property'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrUnknownProperty));
    });

    it('should throw if suffix data is missing properties', async () => {
      const suffixData = {
        onlyOneProperty: 'only 1 property'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrUnknownProperty));
    });

    it('should throw if suffix data type is not string', async () => {
      const suffixData = {
        deltaHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryCommitment: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        type: 123
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataTypeIsNotString));
    });

    it('should throw if suffix data type length is greater than 4', async () => {
      const suffixData = {
        deltaHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryCommitment: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        type: 'this is too long!!!!!'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataTypeLengtGreaterThanFour));
    });

    it('should throw if suffix data type is not in base64url character set', async () => {
      const suffixData = {
        deltaHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryCommitment: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        type: '/\|='
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataTypeInvalidCharacter));
    });
  });
});
