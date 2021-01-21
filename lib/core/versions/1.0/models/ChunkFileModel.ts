/**
 * Defines the external Chunk File structure.
 * Deltas are intentionally objects because at observing time, we don't know if delta are valid or not yet.
 */
export default interface ChunkFileModel {
  deltas: object[];
}
