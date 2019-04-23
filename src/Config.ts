/**
 * This enum contains all the config keys.
 */
export enum ConfigKey {
  BitcoreSidetreeServiceUri = 'bitcoreSidetreeServiceUri',
  SidetreeTransactionPrefix = 'sidetreeTransactionPrefix',
  BitcoinSidetreeGenesisBlockNumber = 'bitcoinSidetreeGenesisBlockNumber',
  BitcoinSidetreeGenesisBlockHash = 'bitcoinSidetreeGenesisBlockHash',
  BitcoinPollingInternalSeconds = 'bitcoinPollingInternalSeconds',
  MaxSidetreeTransactions = 'maxSidetreeTransactions'
}

/**
 * The list of configuration settings used by the Sidetree server.
 */
export class Config {
  [configKey: string]: string;

  /**
   * Loads all the config key-value pairs from the given config file object.
   */
  public constructor (configFile: any) {
    for (const configKeyString in ConfigKey) {
      const configKey: ConfigKey = ConfigKey[configKeyString as keyof typeof ConfigKey];
      const configValue = Config.getValue(configFile, configKey);

      this[configKey] = configValue;
    }
  }

  /**
   * Gets the value of the given config key.
   */
  private static getValue (configFile: any, configKey: ConfigKey): string {
    return configFile[configKey];
  }
}
