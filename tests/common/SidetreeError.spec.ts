import SidetreeError from '../../lib/common/SidetreeError';

describe('SidetreeError', () => {
  describe('createFromError', () => {
    it('should create with given message', () => {
      const actual = SidetreeError.createFromError('code', new Error('This is the message'));
      expect(actual.code).toEqual('code');
      expect(actual.message).toEqual('This is the message');
    });

    it('should create use code as the message if message is not passed in', () => {
      const actual = SidetreeError.createFromError('code', new Error());
      expect(actual.code).toEqual('code');
      expect(actual.message).toEqual('code');
    });
  });
});
