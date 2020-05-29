import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/common/SidetreeError';

describe('CreateOperation', async () => {
  describe('computeDidUniqueSuffix()', async () => {
    it('should pass test vector.', async (done) => {
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
      const services = OperationGenerator.generateServiceEndpoints(['serviceEndpointId123']);
      const [, firstUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const createOperationRequest = await OperationGenerator.generateCreateOperationRequest(
        recoveryPublicKey,
        signingPublicKey,
        firstUpdateCommitmentHash,
        services
      );

      (createOperationRequest as any).extraProperty = 'unknown extra property';

      const createOperationBuffer = Buffer.from(JSON.stringify(createOperationRequest));
      await expectAsync(CreateOperation.parse(createOperationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty));
    });

    it('should throw if operation type is incorrect', async () => {
      const [recoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [signingPublicKey] = await OperationGenerator.generateKeyPair('key2');
      const services = OperationGenerator.generateServiceEndpoints(['serviceEndpointId123']);
      const [, firstUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const createOperationRequest = await OperationGenerator.generateCreateOperationRequest(
        recoveryPublicKey,
        signingPublicKey,
        firstUpdateCommitmentHash,
        services
      );

      createOperationRequest.type = OperationType.Deactivate;

      const createOperationBuffer = Buffer.from(JSON.stringify(createOperationRequest));
      await expectAsync(CreateOperation.parse(createOperationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationTypeIncorrect));
    });
  });

  describe('parseSuffixData()', async () => {
    it('should throw if suffix data is not string', async () => {
      await expectAsync((CreateOperation as any).parseSuffixData(123))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrNotString));
    });

    it('should throw if suffix data contains an additional unknown property.', async () => {
      const [anyRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const suffixData = {
        delta_hash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recovery_key: anyRecoveryPublicKey,
        recovery_commitment: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrUnknownProperty));
    });
  });
});
