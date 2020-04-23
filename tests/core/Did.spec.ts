import Did from '../../lib/core/versions/latest/Did';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import OperationGenerator from '../generators/OperationGenerator';
import Encoder from '../../lib/core/versions/latest/Encoder';

describe('DID', async () => {

  describe('getEncodedCreateRequestFromDidString()', async () => {
    it('should throw if the given did string is not a valid url format', () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (Did as any).getEncodedCreateRequestFromDidString('badURL', ['anyMethodName']),
        ErrorCode.DidInvalidDidString
      );
    });
  });

  describe('create()', async () => {
    it('should create a short-form DID succssefully.', async () => {
      const expectedDidMethodName = 'sidetree';
      const uniqueSuffix = 'abcdefg';
      const didString = `did:${expectedDidMethodName}:${uniqueSuffix}`;
      const did = await Did.create(didString, expectedDidMethodName);
      expect(did.didMethodName).toEqual(expectedDidMethodName);
      expect(did.createOperation).toBeUndefined();
      expect(did.isShortForm).toBeTruthy();
      expect(did.shortForm).toEqual(didString);
      expect(did.uniqueSuffix).toEqual(uniqueSuffix);
    });

    it('should create a long-form DID succssefully.', async () => {
      // Create a long-form DID string.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const encodedCreateOperationRequest = Encoder.encode(createOperationData.createOperation.operationBuffer);
      const didMethodName = 'sidetree';
      const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
      const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
      const longFormDid = `${shortFormDid}?-sidetree-initial-state=${encodedCreateOperationRequest}`;

      const did = await Did.create(longFormDid, didMethodName);
      expect(did.isShortForm).toBeFalsy();
      expect(did.didMethodName).toEqual(didMethodName);
      expect(did.shortForm).toEqual(shortFormDid);
      expect(did.uniqueSuffix).toEqual(didUniqueSuffix);
      expect(did.createOperation).toEqual(createOperationData.createOperation);
    });

    it('should throw error if more than one query param is provided', async () => {
      // Create a long-form DID string.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const encodedCreateOperationRequest = Encoder.encode(createOperationData.createOperation.operationBuffer);
      const didMethodName = 'sidetree';
      const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
      const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
      const longFormDid = `${shortFormDid}?-sidetree-initial-state=${encodedCreateOperationRequest}&extra-param`;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create(longFormDid, didMethodName),
        ErrorCode.DidLongFormOnlyOneQueryParamAllowed
      );
    });

    it('should throw if method name is not valid', async () => {
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create('notValid:method:name:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg', 'notValid:method:name'),
        ErrorCode.DidInvalidMethodName
      );
    });

    it('should throw if DID given does not match the expected DID method name.', async () => {
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create('did:sidetree:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg', 'sidetree2'),
        ErrorCode.DidIncorrectPrefix
      );
    });

    it('should throw if DID given does not contain unique suffix.', async () => {
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create('did:sidetree:', 'sidetree'),
        ErrorCode.DidNoUniqueSuffix
      );
    });

    it('should throw if encoded DID document in long-form DID given results in a mismatching short-form DID.', async () => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const encodedCreateOperationRequest = Encoder.encode(createOperationData.createOperation.operationBuffer);
      const didMethodName = 'sidetree';
      const mismatchingShortFormDid = `did:${didMethodName}:EiA_MismatchingDID_AAAAAAAAAAAAAAAAAAAAAAAAAAA`;
      const longFormDid = `${mismatchingShortFormDid}?-sidetree-initial-state=${encodedCreateOperationRequest}`;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create(longFormDid, didMethodName),
        ErrorCode.DidUniqueSuffixFromInitialStateMismatch
      );
    });

    it('should throw if the given did string does not have query param', async () => {
      // Create a long-form DID string.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const didMethodName = 'sidetree';
      const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
      const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
      const longFormDid = `${shortFormDid}?`;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create(longFormDid, didMethodName),
        ErrorCode.DidLongFormNoInitialStateFound
      );
    });
  });
});
