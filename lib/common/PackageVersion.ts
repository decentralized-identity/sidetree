
import ServiceVersionModel from './models/ServiceVersionModel'; 

export default class PackageVersion {

    private static readonly packageJson = require('../../package.json');

    public static getPackageVersion(serviceName: string): ServiceVersionModel {
        return {
            name: serviceName,
            version: this.packageJson.version
        };        
    }
}