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
      // tslint:disable-next-line:max-line-length
      const suffixDataString = '{"delta_hash":"EiD0ERt_0QnYAoHw0KqhwYyMbMjT_vlvW3C8BuilAWT1Kw","recovery_key":{"kty":"EC","crv":"secp256k1","x":"FDmlOfldNAm9ThIQTj2-UkaCajsfrJOU0wJ7kl3QJHg","y":"bAGx86GZ41PUbzk_bvOKlrW0rXdmnXQrSop7HQoC12Y"},"recovery_commitment":"EiDrKHSo11DLU1uel6fFxH0B-0BLlyu_OinGPmLNvHyVoA"}';
      const encodedSuffixDataString = Encoder.encode(suffixDataString);
      const didUniqueSuffix = (CreateOperation as any).computeDidUniqueSuffix(encodedSuffixDataString);

      const expectedDidUniqueSuffix = 'EiAd7Z1iVTK7P_I9QQyy-muHI2UGSvxjAIzqxW7odZX2-g';
      expect(didUniqueSuffix).toEqual(expectedDidUniqueSuffix);
      done();
    });
  });

  describe('parse()', async () => {
    it('should throw if create operation request has more than 3 properties.', async () => {
      const [recoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [signingPublicKey] = await OperationGenerator.generateKeyPair('key2');
      const services = OperationGenerator.generateServiceEndpoints(['serviceEndpointId123']);
      const [, recoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const [, firstUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const createOperationRequest = await OperationGenerator.generateCreateOperationRequest(
        recoveryPublicKey,
        signingPublicKey,
        recoveryCommitmentHash,
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
      const [, recoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const [, firstUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const createOperationRequest = await OperationGenerator.generateCreateOperationRequest(
        recoveryPublicKey,
        signingPublicKey,
        recoveryCommitmentHash,
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

    it('should throw if suffix data is missing recovery key.', async () => {
      // Intentionally missing `recoveryKey`.
      const suffixData = {
        delta_hash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recovery_commitment: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        unknownProperty: 'An unknown property'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.JwkEs256kUndefined));
    });

    it('should throw if suffix data has recovery key with unknown property.', async () => {
      const suffixData = {
        delta_hash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recovery_key: { knownProperty: 123 },
        recovery_commitment: Encoder.encode(Multihash.hash(Buffer.from('some one time password')))
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.JwkEs256kHasUnknownProperty));
    });
  });
});
