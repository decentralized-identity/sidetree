import TransactionNumber from '../../lib/bitcoin/TransactionNumber';

describe('TransactionNumber', () => {
  it('should have getPosition() return position correctly given a transaction number.', async () => {
    const expectedTransactionIndexInBlock = 8;
    const transactionNumber = TransactionNumber.construct(
      1000000,
      expectedTransactionIndexInBlock
    );
    const actualTransactionIndexInBlock = TransactionNumber.getPosition(
      transactionNumber
    );
    expect(actualTransactionIndexInBlock).toEqual(
      expectedTransactionIndexInBlock
    );
  });
});
