/**
 * This enum contains all the config keys.
 */
export enum ConfigKey {
  IpfsDataStore = 'ipfsDataStore', // Config setting to decide what datastore to use: filesystem/cloud storage.
  IpfsRepo = 'ipfsRepo', // Config setting for root folder name.
  DevMode = 'devMode', // Used to enable test hooks that are disabled in production.
  RequestTimeoutInSeconds = 'requestTimeoutInSeconds',
  Port = 'port'
}

/**
 * The list of configuration settings used by the Sidetree IPFS server.
 */
export class Config {
  [configKey: string]: string;

  /**
   * Loads all the config key-value pairs from the given config file object.
   */
  public constructor (configFile: any) {
    for (const configKeyString in ConfigKey) {
      const configKey: ConfigKey = ConfigKey[configKeyString as keyof typeof ConfigKey];
      const configValue = configFile[configKey];

      this[configKey] = configValue;
    }
  }
}
