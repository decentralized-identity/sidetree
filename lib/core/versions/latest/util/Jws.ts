import Cryptography from './Cryptography';
import Encoder from '../Encoder';
import ErrorCode from '../ErrorCode';
import JwsModel from '../models/JwsModel';
import PublicKeyModel from '../models/PublicKeyModel';
import SidetreeError from '../../../SidetreeError';
import { PrivateKey } from '@decentralized-identity/did-auth-jose';

/**
 * Class containing reusable JWS operations.
 */
export default class Jws {
  /** Signing key ID. */
  public readonly kid: string;
  /** Protected header. */
  public readonly protected: string;
  /** Payload. */
  public readonly payload: string;
  /** Signature. */
  public readonly signature: string;

  private constructor (input: any) {
    const decodedProtectedHeadJsonString = Encoder.decodeAsString(input.protected);
    const decodedProtectedHeader = JSON.parse(decodedProtectedHeadJsonString);

    const headerProperties = Object.keys(decodedProtectedHeader);
    if (headerProperties.length !== 2) {
      throw new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrUnknownProperty);
    }

    // 'protected' property must contain a string 'kid' property.
    if (typeof decodedProtectedHeader.kid !== 'string') {
      throw new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrIncorrectKid);
    }

    // 'protected' property must contain 'alg' property with value 'ES256k'.
    if (decodedProtectedHeader.alg !== 'ES256K') {
      throw new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrIncorrectAlg);
    }

    // Must contain string 'signature' property.
    if (typeof input.signature !== 'string') {
      throw new SidetreeError(ErrorCode.JwsMissingOrIncorrectSignature);
    }

    // Must contain string 'payload' property.
    if (typeof input.payload !== 'string') {
      throw new SidetreeError(ErrorCode.JwsMissingOrIncorrectPayload);
    }

    this.kid = decodedProtectedHeader.kid;
    this.protected = input.protected;
    this.payload = input.payload;
    this.signature = input.signature;
  }

  /**
   * Verifies the JWS signature.
   * @returns true if signature is successfully verified, false otherwise.
   */
  public async verifySignature (publicKey: PublicKeyModel): Promise<boolean> {
    return Jws.verifySignature(this.protected, this.payload, this.signature, publicKey);
  }

  /**
   * Verifies the JWS signature.
   * @returns true if signature is successfully verified, false otherwise.
   */
  public static async verifySignature (
    encodedProtectedHeader: string,
    encodedPayload: string,
    signature: string,
    publicKey: PublicKeyModel
  ): Promise<boolean> {
    // JWS Signing Input spec: ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))
    const jwsSigningInput = encodedProtectedHeader + '.' + encodedPayload;
    const verified = await Cryptography.verifySignature(jwsSigningInput, signature, publicKey);
    return verified;
  }

  /**
   * Signs the given protected header and payload as a JWS.
   *
   * @param payload Unencoded plain object to be stringified and encoded as payload string.
   */
  public static async sign (
    protectedHeader: any,
    payload: any,
    privateKey: string | PrivateKey
  ): Promise<JwsModel> {
    const protectedHeaderJsonString = JSON.stringify(protectedHeader);
    const protectedHeaderEncodedString = Encoder.encode(protectedHeaderJsonString);

    // Create the create payload.
    const payloadJsonString = JSON.stringify(payload);
    const payload = Encoder.encode(payloadJsonString);

    // Generate the signature.
    const signature = await Jws.signInternal(protectedHeaderEncodedString, createPayload, privateKey);

    const jws = {
      protected: protectedHeaderEncodedString,
      payload: createPayload,
      signature
    };

    return jws;
  }

  /**
   * Signs the given encoded protected headder and encoded payload using the given private key.
   * @param privateKey A SECP256K1 private-key either in HEX string format or JWK format.
   */
  private static async signInternal (encodedProtectedHeader: string, encodedPayload: string, privateKey: string | PrivateKey): Promise<string> {
    // JWS Signing Input spec: ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))
    const jwsSigningInput = encodedProtectedHeader + '.' + encodedPayload;
    const signature = await Cryptography.sign(jwsSigningInput, privateKey);
    return signature;
  }

  /**
   * Parses the input as a `Jws` object.
   */
  public static parse (input: any): Jws {
    return new Jws(input);
  }
}
