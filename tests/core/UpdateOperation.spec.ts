import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Multihash from '../../lib/core/versions/latest/Multihash';
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
      await expectAsync(UpdateOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationUpdateRevealValueMissingOrInvalidType));
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

  describe('parseOperationData()', async () => {
    it('should throw if operation data is not string', async () => {
      await expectAsync((UpdateOperation as any).parseOperationData(123)).toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationDataMissingOrNotString));
    });

    it('should throw if operation data contains an additional unknown property.', async () => {
      const operationData = {
        documentPatch: 'any opaque content',
        nextUpdateCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(operationData));
      await expectAsync((UpdateOperation as any).parseOperationData(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationDataMissingOrUnknownProperty));
    });

    it('should throw if operation data is missing documentPatch property.', async () => {
      const operationData = {
        // documentPatch: 'any opaque content', // Intentionally missing.
        nextUpdateCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        unknownProperty: 'An unknown property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(operationData));
      await expectAsync((UpdateOperation as any).parseOperationData(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.UpdateOperationDocumentPatchMissing));
    });
  });
});
