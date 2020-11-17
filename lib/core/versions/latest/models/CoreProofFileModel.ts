/**
 * Defines the external core proof file structure.
 */
export default interface CoreProofFileModel {
  operations: {
    recover?: {
      signedData: string
    }[],
    deactivate?: {
      signedData: string
    }[]
  }
}
