const MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;

/**
 * MongoDB related operations.
 */
export default class MongoDb {
  private static initialized : boolean;

  /**
   * Setup inmemory mongodb to test with
   */
  public static async createInmemoryDb (port: number): Promise<void> {
    if (!MongoDb.initialized) {
      await MongoMemoryServer.create({
        instance: {
          port
        }
      });
      MongoDb.initialized = true;
    }
  }
}
