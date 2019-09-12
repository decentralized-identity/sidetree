
import ServiceVersionModel from './models/ServiceVersionModel'; 

export default class PackageVersion {

    private static readonly packageJson = require('../../package.json');

    public static getPackageVersion(): ServiceVersionModel {
        return {
            name: this.packageJson.name,
            version: this.packageJson.version
        };        
    }
}