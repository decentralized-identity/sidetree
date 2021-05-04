import DeactivateOperation from '../../lib/core/versions/latest/DeactivateOperation';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/common/SidetreeError';

describe('DeactivateOperation', async () => {
  describe('parse()', async () => {
    it('should parse as expected', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg',
        recoveryPrivateKey
      );

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      const result = await DeactivateOperation.parse(operationBuffer);
      expect(result).toBeDefined();
      done();
    });

    it('should throw if operation contains unknown property', async () => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg',
        recoveryPrivateKey
      );

      (deactivateOperationRequest as any).unknownProperty = 'unknown property value'; // Intentionally creating an unknown property.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => DeactivateOperation.parse(operationBuffer),
        ErrorCode.InputValidatorInputContainsNowAllowedProperty,
        'deactivate request'
      );
    });

    it('should throw if operation type is incorrect.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'EiDyOQbbZAa3aiRzeCkV7LOx3SERjjH93EXoIM3UoN4oWg',
        recoveryPrivateKey
      );

      deactivateOperationRequest.type = OperationType.Create; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationTypeIncorrect));
      done();
    });

    it('should throw if didUniqueSuffix is not string.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey
      );

      (deactivateOperationRequest.didSuffix as any) = 123; // Intentionally incorrect type.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation
        .parse(operationBuffer)).toBeRejectedWith(new SidetreeError(`The deactivate request didSuffix must be a string but is of number type.`));
      done();
    });

    it('should throw if didUniqueSuffix is undefined.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey
      );

      (deactivateOperationRequest.didSuffix as any) = undefined; // Intentionally undefined.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation
        .parse(operationBuffer)).toBeRejectedWith(new SidetreeError(`The deactivate request didSuffix must be a string but is of undefined type.`));
      done();
    });

    it('should throw if didUniqueSuffix is not encoded multihash.', async (done) => {
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();

      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        'unused-DID-unique-suffix',
        recoveryPrivateKey
      );

      (deactivateOperationRequest.didSuffix as any) = 'thisIsNotMultihash'; // Intentionally not multihash.

      const operationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      await expectAsync(DeactivateOperation
        .parse(operationBuffer)).toBeRejectedWith(new SidetreeError(`Given deactivate request didSuffix string 'thisIsNotMultihash' is not a multihash.`));
      done();
    });
  });

  describe('parseObject()', async () => {
    it('should throw if hash of `recoveryKey` does not match the revealValue.', async () => {
      const didSuffix = OperationGenerator.generateRandomHash();
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const deactivateRequest = await OperationGenerator.createDeactivateOperationRequest(didSuffix, recoveryPrivateKey);

      // Intentionally have a mismatching reveal value.
      deactivateRequest.revealValue = OperationGenerator.generateRandomHash();

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => DeactivateOperation.parseObject(deactivateRequest, Buffer.from('unused')),
        ErrorCode.CanonicalizedObjectHashMismatch,
        'deactivate request'
      );
    });

    it('should throw if revealValue is not a multihash.', async () => {
      const didSuffix = OperationGenerator.generateRandomHash();
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const deactivateRequest = await OperationGenerator.createDeactivateOperationRequest(didSuffix, recoveryPrivateKey);

      // Intentionally have an invalid non-multihash reveal value.
      deactivateRequest.revealValue = 'not-a-multihash';

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => DeactivateOperation.parseObject(deactivateRequest, Buffer.from('unused')),
        ErrorCode.MultihashStringNotAMultihash,
        'deactivate request'
      );
    });

    it('should throw if revealValue is an unsupported multihash.', async () => {
      const didSuffix = OperationGenerator.generateRandomHash();
      const [, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const deactivateRequest = await OperationGenerator.createDeactivateOperationRequest(didSuffix, recoveryPrivateKey);

      // Intentionally have an unsupported multihash.
      deactivateRequest.revealValue = 'ARSIZ8iLVuC_uCz_rxWma8jRB9Z1Sg'; // SHA1

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => DeactivateOperation.parseObject(deactivateRequest, Buffer.from('unused')),
        ErrorCode.MultihashNotSupported,
        'deactivate request'
      );
    });
  });

  describe('parseSignedDataPayload()', async () => {
    it('should throw if signedData contains an additional unknown property.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedData = {
        didSuffix: didUniqueSuffix,
        revealValue: recoveryRevealValue,
        extraProperty: 'An unknown extra property'
      };
      const signedDataEncodedString = Encoder.encode(JSON.stringify(signedData));
      await expectAsync(DeactivateOperation.parseSignedDataPayload(signedDataEncodedString, didUniqueSuffix))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if signedData is missing expected properties.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const signedData = {};
      const signedDataEncodedString = Encoder.encode(JSON.stringify(signedData));
      await expectAsync(DeactivateOperation.parseSignedDataPayload(signedDataEncodedString, didUniqueSuffix))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDataMissingOrUnknownProperty));
      done();
    });

    it('should throw if signed `didUniqueSuffix` is mismatching.', async (done) => {
      const didUniqueSuffix = 'anyUnusedDidUniqueSuffix';
      const recoveryRevealValue = 'anyUnusedRecoveryRevealValue';
      const signedData = {
        didSuffix: didUniqueSuffix,
        revealValue: recoveryRevealValue
      };
      const encodedSignedData = Encoder.encode(JSON.stringify(signedData));
      await expectAsync(DeactivateOperation.parseSignedDataPayload(encodedSignedData, 'mismatchingDidUniqueSuffix'))
        .toBeRejectedWith(new SidetreeError(ErrorCode.DeactivateOperationSignedDidUniqueSuffixMismatch));
      done();
    });
  });
});
