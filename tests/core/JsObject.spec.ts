import JsObject from '../../lib/core/versions/latest/util/JsObject';

describe('JsObject', () => {
  describe('deepCopyObject', () => {
    it('should deep copy correctly.', () => {
      const original = { number: 1, object: { x: 'x' }, array: [1, 2, 3] };
      const copy = JsObject.deepCopyObject(original);

      original.number = 2;
      original.object.x = 'y';
      original.array[0] = 4;

      expect(original.number).not.toEqual(copy.number);
      expect(original.object).not.toEqual(copy.object);
      expect(original.array).not.toEqual(copy.array);

      expect(copy.number).toEqual(1);
      expect(copy.object).toEqual({ x: 'x' });
      expect(copy.array).toEqual([1, 2, 3]);
    });
  });

  describe('clearObject', () => {
    it('should clear object correctly.', () => {
      const inputObject: any = { number: 1, object: { x: 'x' }, array: [1, 2, 3] };
      JsObject.clearObject(inputObject);

      expect(inputObject).toEqual({ });
    });
  });
});
