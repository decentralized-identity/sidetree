import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/common/SidetreeError';

describe('CreateOperation', async () => {
  describe('parseObject', () => {
    it('should leave delta as empty if it is not valid', () => {
      const operationObject = {
        type: 'create',
        suffixData: {
          deltaHash: OperationGenerator.generateRandomHash(),
          recoveryCommitment: OperationGenerator.generateRandomHash()
        },
        delta: 'this is not a valid delta'
      };

      const result = CreateOperation.parseObject(operationObject, Buffer.from('something'));
      expect(result.delta).toBeUndefined();
    });

    it('should throw sidetree error if object contains more or less than 3 properties', () => {
      const twoProperties = { one: 1, two: 2 };
      const fourProperties = { one: 1, two: 2, three: 3, four: 4 };

      try {
        CreateOperation.parseObject(twoProperties, Buffer.from(JSON.stringify(twoProperties)));
        fail('expect to throw sidetree error but did not');
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty));
      }

      try {
        CreateOperation.parseObject(fourProperties, Buffer.from(JSON.stringify(fourProperties)));
        fail('expect to throw sidetree error but did not');
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty));
      }
    });

    it('should throw sidetree error if operation type is not create.', () => {
      const testObject = {
        type: 'notCreate',
        suffixData: {
          deltaHash: OperationGenerator.generateRandomHash(),
          recoveryCommitment: OperationGenerator.generateRandomHash()
        },
        delta: 'something'
      };

      try {
        CreateOperation.parseObject(testObject, Buffer.from(JSON.stringify(testObject)));
        fail('expect to throw sidetree error but did not');
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.CreateOperationTypeIncorrect));
      }
    });
  });

  describe('parse()', async () => {
    it('should throw if create operation request has more than 3 properties.', async () => {
      const [recoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [signingPublicKey] = await OperationGenerator.generateKeyPair('key2');
      const services = OperationGenerator.generateServices(['serviceId123']);
      const createOperationRequest = await OperationGenerator.createCreateOperationRequest(
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
      const createOperationRequest = await OperationGenerator.createCreateOperationRequest(
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
});
