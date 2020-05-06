/**
 * Defines the external Anchor File structure.
 */
export default interface AnchorFileModel {
  writer_lock_id: string | undefined;
  map_file_uri: string;
  operations: {
    create?: {
      suffix_data: string;
    }[],
    recover?: {
      did_suffix: string;
      recovery_reveal_value: string;
      signed_data: string;
    }[],
    deactivate?: {
      did_suffix: string;
      recovery_reveal_value: string;
      signed_data: string;
    }[]
  };
}
