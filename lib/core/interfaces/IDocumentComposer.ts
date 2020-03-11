import DocumentState from '../models/DocumentState';

/**
 * Interface that defines a class that composes external document from internal document state.
 */
export default interface IDocumentComposer {

  /**
   * Transforms the given document state into an external facing document.
   * @param documentState The document state to be transformed.
   *
   * @returns The outcome of the transfrom.
   */
  transform (documentState: DocumentState): any;
}
