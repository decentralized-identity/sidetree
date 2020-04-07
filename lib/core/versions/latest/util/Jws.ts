import Encoder from '../Encoder';
import ErrorCode from '../ErrorCode';
import JwkEs256k from '../../../models/JwkEs256k';
import JwsModel from '../models/JwsModel';
import SidetreeError from '../../../../common/SidetreeError';
import { JWS } from 'jose';

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
   * Returns this object as a JwsModel object.
   */
  public toJwsModel (): JwsModel {
    return {
      protected: this.protected,
      payload: this.payload,
      signature: this.signature
    };
  }

  /**
   * Verifies the JWS signature.
   * @returns true if signature is successfully verified, false otherwise.
   */
  public async verifySignature (publicKey: JwkEs256k): Promise<boolean> {
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
    publicKey: JwkEs256k
  ): Promise<boolean> {
    const jwsSigningInput = encodedProtectedHeader + '.' + encodedPayload + '.' + signature;
    const signatureValid = Jws.verifyCompactJws(jwsSigningInput, publicKey);
    return signatureValid;
  }

  /**
   * Verifies the compact JWS string using the given JWK key.
   * @returns true if signature is valid; else otherwise.
   */
  public static verifyCompactJws (compactJws: string, jwk: any): boolean {
    try {
      JWS.verify(compactJws, jwk);
      return true;
    } catch (error) {
      console.log(`Input '${compactJws}' failed signature verification: ${SidetreeError.createFromError(ErrorCode.JwsFailedSignatureValidation, error)}`);
      return false;
    }
  }

  /**
   * Signs the given protected header and payload as a JWS.
   * NOTE: this is mainly used by tests to create valid test data.
   *
   * @param payload If the given payload is of string type, it is assumed to be encoded string;
   *                else the object will be stringified and encoded.
   */
  public static async sign (
    protectedHeader: any,
    payload: any,
    privateKey: JwkEs256k
  ): Promise<JwsModel> {

    const flattenedJws = JWS.sign.flattened(payload, privateKey as any, protectedHeader);
    const jws = {
      protected: flattenedJws.protected!,
      payload: flattenedJws.payload,
      signature: flattenedJws.signature
    };

    return jws;
  }

  /**
   * Signs the given payload as a compact JWS string.
   * This is mainly used by tests to create valid test data.
   */
  public static signAsCompactJws (payload: object, privateKey: any): string {
    const compactJws = JWS.sign(payload, privateKey);
    return compactJws;
  }

  /**
   * Parses the input as a `Jws` object.
   */
  public static parse (input: any): Jws {
    return new Jws(input);
  }
}
