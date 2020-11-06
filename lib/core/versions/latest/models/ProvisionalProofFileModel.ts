/**
 * Defines the external provisional proof file structure.
 */
export default interface ProvisionalProofFileModel {
  operations: {
    update: {
      signedData: string
    }[]
  }
}
