
import ServiceVersionModel from './models/ServiceVersionModel'; 

export default class ServiceInfo {

    private static readonly packageJson = require('../../package.json');

    private serviceName: string;

    constructor(serviceName: string) {
        this.serviceName = serviceName;
    }

    public getServiceVersion(): ServiceVersionModel {
        return {
            name: this.serviceName,
            version: ServiceInfo.packageJson.version
        };        
    }
}