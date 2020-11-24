import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import SidetreeError from '../../lib/common/SidetreeError';

describe('RecoverOperation', async () => {
  describe('parse()', async () => {
    it('parse as expected', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('singingKey');

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey
      );

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      const result = await RecoverOperation.parse(operationBuffer);
      expect(result).toBeDefined();
      done();
    });

    it('should throw if operation type is incorrect', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('singingKey');

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey
      );

      recoverOperationRequest.type = OperationType.Create; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationTypeIncorrect));
      done();
    });

    it('should throw if didUniqueSuffix is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('singingKey');

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey
      );

      (recoverOperationRequest.didSuffix as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationMissingOrInvalidDidUniqueSuffix));
      done();
    });

  });

  describe('parseObject()', async () => {
    it('should throw if operation contains an additional unknown property.', async (done) => {
      const recoverOperation = {
        type: OperationType.Recover,
        didSuffix: 'unusedSuffix',
        revealValue: 'unusedReveal',
        signedData: 'unusedSignedData',
        extraProperty: 'thisPropertyShouldCauseErrorToBeThrown'
      };

      await expectAsync(RecoverOperation.parseObject(recoverOperation, Buffer.from('anyValue')))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationMissingOrUnknownProperty));
      done();
    });
  });

  describe('parseSignedDataPayload()', async () => {
    it('should throw if signedData contains an additional unknown property.', async (done) => {
      const signedData = {
        deltaHash: 'anyUnusedHash',
        recoveryKey: 'anyUnusedRecoveryKey',
        nextRecoveryCommitmentHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property',
        revealValue: 'some value'
      };
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync(RecoverOperation.parseSignedDataPayload(encodedSignedData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if signedData missing property.', async (done) => {
      const signedData = {
      };
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync(RecoverOperation.parseSignedDataPayload(encodedSignedData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.RecoverOperationSignedDataMissingOrUnknownProperty));
      done();
    });
  });
});
