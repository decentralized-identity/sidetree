import Config from '../../lib/core/models/Config';

const MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;

/**
 * MongoDB related operations.
 */
export default class MongoDb {
  private static initialized : boolean;

  /**
   * Setup inmemory mongodb to test with
   */
  public static async createInmemoryDb (config: Config): Promise<void> {
    if (!MongoDb.initialized) {
      // If the test config says localhost, then launch in-memory mongodb.
      // Otherwise, assume the database is already running
      const prefix = 'mongodb://localhost:';
      if (config.mongoDbConnectionString.startsWith(prefix)) {
        const port = parseInt(config.mongoDbConnectionString.substr(prefix.length));
        await MongoMemoryServer.create({
          instance: {
            port
          }
        });
      }
      MongoDb.initialized = true;
    }
  }
}
