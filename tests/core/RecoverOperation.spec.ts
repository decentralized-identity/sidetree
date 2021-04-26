import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
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
        'EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg',
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
        'EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg',
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
      await expectAsync(RecoverOperation
        .parse(operationBuffer))
        .toBeRejectedWith(new SidetreeError(`The recover request didSuffix must be a string but is of number type.`));
      done();
    });

    it('should throw if didUniqueSuffix is undefined.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('singingKey');

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey
      );

      (recoverOperationRequest.didSuffix as any) = undefined; // Intentionally undefined.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation
        .parse(operationBuffer))
        .toBeRejectedWith(new SidetreeError(`The recover request didSuffix must be a string but is of undefined type.`));
      done();
    });

    it('should throw if didUniqueSuffix is not multihash.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('singingKey');

      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey
      );

      (recoverOperationRequest.didSuffix as any) = 'thisIsNotMultiHash'; // Intentionally not multihash.

      const operationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      await expectAsync(RecoverOperation
        .parse(operationBuffer))
        .toBeRejectedWith(new SidetreeError(`Given recover request didSuffix string 'thisIsNotMultiHash' is not a multihash.`));
      done();
    });
  });

  describe('parseObject()', async () => {
    it('should throw if operation contains an additional unknown property.', async () => {
      const recoverOperation = {
        type: OperationType.Recover,
        didSuffix: 'unusedSuffix',
        revealValue: 'unusedReveal',
        signedData: 'unusedSignedData',
        delta: 'unusedDelta',
        extraProperty: 'thisPropertyShouldCauseErrorToBeThrown'
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => RecoverOperation.parseObject(recoverOperation, Buffer.from('unused')),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty,
        'recover request'
      );
    });

    it('should throw if hash of `recoveryKey` does not match the revealValue.', async () => {
      const didUniqueSuffix = OperationGenerator.generateRandomHash();
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const recoverOperationData = await OperationGenerator.generateRecoverOperation({ didUniqueSuffix, recoveryPrivateKey });
      const recoverRequest = JSON.parse(recoverOperationData.operationBuffer.toString());

      // Intentionally have a mismatching reveal value.
      recoverRequest.revealValue = OperationGenerator.generateRandomHash();

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => RecoverOperation.parseObject(recoverRequest, Buffer.from('unused')),
        ErrorCode.CanonicalizedObjectHashMismatch,
        'recover request'
      );
    });
  });

  describe('parseSignedDataPayload()', async () => {
    it('should throw if signedData contains an additional unknown property.', async (done) => {
      const nextRecoveryCommitmentHash = OperationGenerator.generateRandomHash();
      const signedData = {
        deltaHash: 'anyUnusedHash',
        recoveryKey: 'anyUnusedRecoveryKey',
        nextRecoveryCommitmentHash,
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
