import ServiceVersionModel from './models/ServiceVersionModel';
/**
 * Encapsulates the functionality to get the information about the service such as
 * version info.
 */
export default class ServiceInfoProvider {

  private static readonly packageJson = require('../../package.json');
  private serviceName: string;

  constructor (serviceName: string) {
    this.serviceName = serviceName;
  }
  /**
   * Gets the service version from the package.json file.
   */
  public getServiceVersion (): ServiceVersionModel {
    return {
      name: this.serviceName,
      version: ServiceInfoProvider.packageJson.version
    };
  }
  /**
   * Gets an 'empty' service version object.
   */
  public static getEmptyServiceVersion (): ServiceVersionModel {
    return {
      name: 'undefined',
      version: 'undefined'
    };
  }
  /**
   * Returns true if the parameter service version is an 'empty' one; false otherwise.
   * @param serviceVersionModel The service version object to check.
   */
  public static isEmptyServiceVersionModel (serviceVersionModel: ServiceVersionModel): boolean {
    return serviceVersionModel.name === 'undefined' &&
      serviceVersionModel.version === 'undefined';
  }
}
