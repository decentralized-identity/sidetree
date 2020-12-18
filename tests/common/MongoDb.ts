import { MongoClient } from 'mongodb';

/**
 * MongoDB related operations.
 */
export default class MongoDb {
  /**
   * Test if a MongoDB service is running at the specified url.
   */
  public static async isServerAvailable (serverUrl: string): Promise<boolean> {
    try {
      const client = await MongoClient.connect(serverUrl);
      await client.close();
    } catch (error) {
      console.info('Mongoclient connect error: ' + error);
      return false;
    }
    return true;
  }
}
