/**
 * Sidetree patch actions. These are the valid values in the action property of a patch.
 */
enum PatchAction {
    Replace = 'replace',
    AddPublicKeys = 'add-public-keys',
    RemovePublicKeys = 'remove-public-keys',
    AddServices = 'add-services',
    RemoveServices = 'remove-services'
}

export default PatchAction;
