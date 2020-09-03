import * as crypto from 'crypto';
import Did from '../../lib/core/versions/latest/Did';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import OperationGenerator from '../generators/OperationGenerator';

describe('DID', async () => {
  describe('create()', async () => {
    it('should create a short-form DID successfully.', async () => {
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

    it('should create a long-form DID successfully.', async () => {
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
      expect(did.didMethodName).toEqual(didMethodName);
      expect(did.shortForm).toEqual(shortFormDid);
      expect(did.uniqueSuffix).toEqual(didUniqueSuffix);
      expect(did.createOperation).toEqual(createOperationData.createOperation);
    });

    it('should create a long-form DID with suffix data and delta successfully.', async () => {
      // Create a long-form DID string.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const didMethodName = 'sidetree';
      const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
      const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
      const encodedSuffixData = createOperationData.createOperation.encodedSuffixData;
      const encodedDelta = createOperationData.createOperation.encodedDelta;
      const longFormDid = `${shortFormDid}:${encodedSuffixData}.${encodedDelta}`;

      const did = await Did.create(longFormDid, didMethodName);
      expect(did.isShortForm).toBeFalsy();
      expect(did.didMethodName).toEqual(didMethodName);
      expect(did.shortForm).toEqual(shortFormDid);
      expect(did.uniqueSuffix).toEqual(didUniqueSuffix);
      expect(did.createOperation).toEqual(createOperationData.createOperation);
    });

    it('should create a testnet long-form DID successfully.', async () => {
      // Create a long-form DID string.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const didMethodName = 'sidetree:testnet'; // A method name with network ID.
      const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
      const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
      const encodedSuffixData = createOperationData.createOperation.encodedSuffixData;
      const encodedDelta = createOperationData.createOperation.encodedDelta;
      const longFormDid = `${shortFormDid}?-sidetree-initial-state=${encodedSuffixData}.${encodedDelta}`;

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
      const didMethodName = 'sidetree';
      const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
      const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
      const longFormDid = `${shortFormDid}?-sidetree-initial-state=unused_suffix_data.unused_delta&extra-param`;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create(longFormDid, didMethodName),
        ErrorCode.DidLongFormOnlyOneQueryParamAllowed
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

    it('should throw if long-form DID has `delta` that exceeds max size.', async () => {
      // Create a long-form DID string.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const didMethodName = 'sidetree';
      const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
      const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
      const encodedSuffixData = createOperationData.createOperation.encodedSuffixData;
      const encodedDelta = crypto.randomBytes(2000).toString('hex');// Intentionally exceeding max size.
      const longFormDid = `${shortFormDid}?-sidetree-initial-state=${encodedSuffixData}.${encodedDelta}`;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create(longFormDid, didMethodName),
        ErrorCode.DeltaExceedsMaximumSize
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

    it('should throw if there are no two parts in initial state.', async (done) => {
      const initialState1 = 'abc.'; // Intentionally not having two parts after splitting by '.'
      const initialState2 = '.abc'; // Intentionally not having two parts after splitting by '.'

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => (Did as any).constructCreateOperationFromInitialState(initialState1), ErrorCode.DidInitialStateValueDoesNotContainTwoParts
      );

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => (Did as any).constructCreateOperationFromInitialState(initialState2), ErrorCode.DidInitialStateValueDoesNotContainTwoParts
      );

      done();
    });
  });

  describe('getInitialStateFromDidStringWithQueryParameter()', async () => {
    it('should throw if the given DID string is not a valid url format', async (done) => {
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => (Did as any).getInitialStateFromDidStringWithQueryParameter('@#$%^:sidetree:123', 'sidetree'),
        ErrorCode.DidInvalidDidString
      );
      done();
    });

    it('should expect -<method-name>-initial-state URL param name to not contain network ID if method name given contains network ID.', async (done) => {
      const initialState = (Did as any).getInitialStateFromDidStringWithQueryParameter('did:sidetree:123?-sidetree-initial-state=xyz', 'sidetree:test');
      expect(initialState).toEqual('xyz');
      done();
    });
  });
});
