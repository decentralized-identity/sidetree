import Delta from "../../lib/core/versions/latest/Delta";
import ErrorCode from "../../lib/core/versions/latest/ErrorCode";
import JasmineSidetreeErrorValidator from "../JasmineSidetreeErrorValidator";


function generateLongString (length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
        result = result + 'a';
    }
    return result;
}

describe('Delta', () => {
    describe('validateEncodedDeltaSize', () => {
        it('should throw sidetree if encoded size exceeds max limit', () => {
            const mockEncodedDelta = generateLongString(2000);
            JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
                () => { Delta.validateEncodedDeltaSize(mockEncodedDelta); },
                ErrorCode.DeltaExceedsMaximumSize
            )
        })

        it('should not throw if encoded size does not exceed max limit', () => {
            const mockEncodedDelta = generateLongString(1);
            try {
                Delta.validateEncodedDeltaSize(mockEncodedDelta);
            } catch (e) {
                fail(`Expected no error but got ${e}`);
            }
        })
    })

    describe('validateDeltaSize', () => {
        it('should throw sidetree error if delta size exceeds max limit', () => {
            const mockDelta = {
                "someKey": generateLongString(2000)
            }
            JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
                () => { Delta.validateDeltaSize(mockDelta) },
                ErrorCode.DeltaExceedsMaximumSize
            )
        })

        it('should throw sidetree error if delta is null', () => {
            const mockDelta = null
            JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
                () => { Delta.validateDeltaSize(mockDelta) },
                ErrorCode.DeltaIsNullOrUndefined
            )
        })

        it('should throw sidetree error if delta is undefined', () => {
            const mockDelta = undefined
            JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
                () => { Delta.validateDeltaSize(mockDelta) },
                ErrorCode.DeltaIsNullOrUndefined
            )
        })

        it('should not throw if delta size is valid', () => {
            const mockDelta = {
                'someKey': 'some value'
            }

            try {
                Delta.validateDeltaSize(mockDelta)
            } catch (e) {
                fail(`Expected no error but got ${e}`);
            }
        })
    })
})