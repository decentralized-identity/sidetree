import Cryptography from '../../src/lib/Cryptography';
import DidPublicKey from '../../src/lib/DidPublicKey';
import Encoder from '../../src/Encoder';
import { PrivateKey } from '@decentralized-identity/did-auth-jose';

/**
 * A class that can generate valid write operations.
 * Mainly useful for testing purposes.
 */
export default class OperationGenerator {

  /**
   * Creates a Create Operation with valid signature.
   * @param didDocumentTemplate A DID Document used as the template. Must contain at least one public-key.
   */
  public static async generateCreateOperation (didDocumentTemplate: any, publicKey: DidPublicKey, privateKey: string | PrivateKey): Promise<Buffer> {
    // Replace the placeholder public-key with the public-key given.
    didDocumentTemplate.publicKey[0] = publicKey;

    // Create the create payload.
    const didDocumentJson = JSON.stringify(didDocumentTemplate);
    const createPayload = Encoder.encode(didDocumentJson);

    // Generate the signature.
    const signature = await Cryptography.sign(createPayload, privateKey);

    const operation = {
      signingKeyId: publicKey.id,
      createPayload,
      signature,
      proofOfWork: 'proof of work'
    };

    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Generates an Update Operation with valid signature.
   */
  public static async generateUpdateOperation (updatePayload: object, keyId: string, privateKey: string | PrivateKey): Promise<Buffer> {
    // Encode Update payload.
    const updatePayloadJson = JSON.stringify(updatePayload);
    const updatePayloadEncoded = Encoder.encode(updatePayloadJson);

    // Generate the signature.
    const signature = await Cryptography.sign(updatePayloadEncoded, privateKey);

    const operation = {
      signingKeyId: keyId,
      updatePayload: updatePayloadEncoded,
      signature,
      proofOfWork: 'proof of work'
    };

    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Generates a Delete Operation.
   */
  public static async generateDeleteOperation (did: string): Promise<Buffer> {
    const payload = { did };

    // Encode payload.
    const payloadJson = JSON.stringify(payload);
    const updatePayloadEncoded = Encoder.encode(payloadJson);

    const operation = {
      signingKeyId: 'not implemented',
      deletePayload: updatePayloadEncoded,
      signature: 'not implemented',
      proofOfWork: 'proof of work'
    };

    return Buffer.from(JSON.stringify(operation));
  }
}
