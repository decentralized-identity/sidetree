import Did from '../../lib/core/versions/latest/Did';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import OperationGenerator from '../generators/OperationGenerator';

describe('DID', async () => {
  describe('create()', async () => {
    it('should create a short-form DID succssefully.', async () => {
      const expectedDidMethodName = 'sidetree';
      const uniqueSuffix = 'abcdefg';
      const didString = `did:${expectedDidMethodName}:${uniqueSuffix}`;
      const did = await Did.create(didString, expectedDidMethodName);
      expect(did.methodName).toEqual(expectedDidMethodName);
      expect(did.createOperation).toBeUndefined();
      expect(did.isShortForm).toBeTruthy();
      expect(did.shortForm).toEqual(didString);
      expect(did.uniqueSuffix).toEqual(uniqueSuffix);
    });

    it('should create a long-form DID succssefully.', async () => {
      // Create a long-form DID string.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const didMethodName = 'sidetree';
      const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
      const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
      const encodedSuffixData = createOperationData.createOperation.encodedSuffixData;
      const encodedDelta = createOperationData.createOperation.encodedDelta;
      const longFormDid = `${shortFormDid}?-sidetree-initial-state=${encodedSuffixData}.${encodedDelta}`;

      const did = await Did.create(longFormDid, didMethodName);
      expect(did.isShortForm).toBeFalsy();
      expect(did.methodName).toEqual(didMethodName);
      expect(did.shortForm).toEqual(shortFormDid);
      expect(did.uniqueSuffix).toEqual(didUniqueSuffix);
      expect(did.createOperation).toEqual(createOperationData.createOperation);
    });

    it('should throw error if more than one query param is provided', async () => {
      // Create a long-form DID string.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const didMethodName = 'sidetree';
      const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
      const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
      const encodedSuffixData = createOperationData.createOperation.encodedSuffixData;
      const encodedDelta = createOperationData.createOperation.encodedDelta;
      const longFormDid = `${shortFormDid}?-sidetree-initial-state=${encodedSuffixData}.${encodedDelta}&extra-param`;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create(longFormDid, didMethodName),
        ErrorCode.DidLongFormOnlyOneQueryParamAllowed
      );
    });

    it('should throw if DID given does not match the expected DID method name.', async () => {
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create('did:sidetree:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg', 'did:sidetree2:'),
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
      const didMethodName = 'sidetree';
      const encodedSuffixData = createOperationData.createOperation.encodedSuffixData;
      const encodedDelta = createOperationData.createOperation.encodedDelta;
      const mismatchingShortFormDid = `did:${didMethodName}:EiA_MismatchingDID_AAAAAAAAAAAAAAAAAAAAAAAAAAA`;
      const longFormDid = `${mismatchingShortFormDid}?-sidetree-initial-state=${encodedSuffixData}.${encodedDelta}`;

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

  describe('constructCreateOperationFromInitialState()', async () => {
    it('should throw if the given initial state string does not have a dot.', async (done) => {
      const initialState = 'abcdefg'; // Intentionally missing '.'

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => (Did as any).constructCreateOperationFromInitialState(initialState), ErrorCode.DidInitialStateValueContainsNoDot
      );
      done();
    });

    it('should throw if the given initial state string has more than one dot.', async (done) => {
      const initialState = 'abc.123.'; // Intentionally having more than 1 '.'

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => (Did as any).constructCreateOperationFromInitialState(initialState), ErrorCode.DidInitialStateValueContainsMoreThanOneDot
      );
      done();
    });

    it('should throw if the given initial state string has more than one dot.', async (done) => {
      const initialState = 'abc.'; // Intentionally not having two parts after splitting by '.'

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => (Did as any).constructCreateOperationFromInitialState(initialState), ErrorCode.DidInitialStateValueDoesNotContainTwoParts
      );
      done();
    });
  });

  describe('getInitialStateFromDidString()', async () => {
    it('should throw if the given did string is not a valid url format', async (done) => {
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => (Did as any).getInitialStateFromDidString('@#$%^:sdietree:123', 'sidetree'),
        ErrorCode.DidInvalidDidString
      );
      done();
    });

    it('should expect -<method-name>-initial-state URL param name to not contain network ID if method name given contains network ID.', async (done) => {
      const initialState = (Did as any).getInitialStateFromDidString('did:sdietree:123?-sidetree-initial-state=xyz', 'sidetree:test');
      expect(initialState).toEqual('xyz');
      done();
    });
  });
});
