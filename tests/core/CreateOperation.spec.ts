import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/common/SidetreeError';

describe('CreateOperation', async () => {
  describe('parse()', async () => {
    it('should throw if create operation request has more than 3 properties.', async () => {
      const [recoveryPublicKey] = await Cryptography.generateKeyPairHex('#key1');
      const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key2');
      const services = OperationGenerator.createIdentityHubUserServiceEndpoints(['did:sidetree:value0']);
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
      const [recoveryPublicKey] = await Cryptography.generateKeyPairHex('#key1');
      const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key2');
      const services = OperationGenerator.createIdentityHubUserServiceEndpoints(['did:sidetree:value0']);
      const [, recoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const [, firstUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const createOperationRequest = await OperationGenerator.generateCreateOperationRequest(
        recoveryPublicKey,
        signingPublicKey,
        recoveryCommitmentHash,
        firstUpdateCommitmentHash,
        services
      );

      createOperationRequest.type = OperationType.Revoke;

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
      const suffixData = {
        operationDataHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryKey: { publicKeyHex: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
        nextRecoveryCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrUnknownProperty));
    });

    it('should throw if suffix data is missing recovery key.', async () => {
      const suffixData = {
        operationDataHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        // recoveryKey: { publicKeyHex: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }, // Intentionally missing.
        nextRecoveryCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        unknownProperty: 'An unknown property'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.OperationRecoveryKeyUndefined));
    });

    it('should throw if suffix data has invalid recovery key.', async () => {
      const suffixData = {
        operationDataHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryKey: { knownKeyType: 123 },
        nextRecoveryCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password')))
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.OperationRecoveryKeyInvalid));
    });
  });
});
