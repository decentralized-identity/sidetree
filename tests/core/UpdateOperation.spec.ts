import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/common/SidetreeError';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';

describe('UpdateOperation', async () => {
  describe('parse()', async () => {
    it('should throw if didUniqueSuffix is not string.', async () => {
      const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex('#key');
      const [, unusedNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
        'unused-DID-unique-suffix',
        'unused-update-reveal-value',
        unusedNextUpdateCommitmentHash,
        'opaque-unused-document-patch',
        signingPublicKey.id,
        signingPrivateKey
      );

      (updateOperationRequest.didUniqueSuffix as any) = 123;

      const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
      await expectAsync(UpdateOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationMissingDidUniqueSuffix));
    });

    it('should throw if operation type is incorrect', async () => {
      const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex('#key');
      const [, unusedNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
        'unused-DID-unique-suffix',
        'unused-update-reveal-value',
        unusedNextUpdateCommitmentHash,
        'opaque-unused-document-patch',
        signingPublicKey.id,
        signingPrivateKey
      );

      updateOperationRequest.type = OperationType.Revoke;

      const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
      await expectAsync(UpdateOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationTypeIncorrect));
    });

    it('should throw if updateRevealValue is not string.', async () => {
      const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex('#key');
      const [, unusedNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
        'unused-DID-unique-suffix',
        'unused-update-reveal-value',
        unusedNextUpdateCommitmentHash,
        'opaque-unused-document-patch',
        signingPublicKey.id,
        signingPrivateKey
      );

      (updateOperationRequest.updateRevealValue as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
      await expectAsync(UpdateOperation.parse(operationBuffer))
              .toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationUpdateRevealValueMissingOrInvalidType));
    });

    it('should throw if recoveryRevealValue is too long.', async () => {
      const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex('#key');
      const [, unusedNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
        'unused-DID-unique-suffix',
        'super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal-super-long-reveal',
        unusedNextUpdateCommitmentHash,
        'opaque-unused-document-patch',
        signingPublicKey.id,
        signingPrivateKey
      );

      const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
      await expectAsync(UpdateOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationUpdateRevealValueTooLong));
    });
  });
});
