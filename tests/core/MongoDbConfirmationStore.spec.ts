import Config from '../../lib/core/models/Config';
import MongoDb from '../common/MongoDb';
import MongoDbConfirmationStore from '../../lib/core/MongoDbConfirmationStore';

/**
 * Creates a MongoDbConfirmationStore and initializes it.
 */
async function createConfirmationStore (ConfirmationStoreUri: string, databaseName: string): Promise<MongoDbConfirmationStore> {
  const ConfirmationStore = new MongoDbConfirmationStore(ConfirmationStoreUri, databaseName);
  await ConfirmationStore.initialize();
  return ConfirmationStore;
}

describe('MongoDbConfirmationStore', async () => {
  const config: Config = require('../json/config-test.json');
  const databaseName = 'sidetree-test';

  let mongoServiceAvailable: boolean | undefined;
  let confirmationStore: MongoDbConfirmationStore;
  beforeAll(async () => {
    mongoServiceAvailable = await MongoDb.isServerAvailable(config.mongoDbConnectionString);
    if (mongoServiceAvailable) {
      confirmationStore = await createConfirmationStore(config.mongoDbConnectionString, databaseName);
    }
  });

  beforeEach(async () => {
    if (!mongoServiceAvailable) {
      pending('MongoDB service not available');
    }

    await confirmationStore.clearCollection();
  });

  describe('getLastSubmitted', () => {
    it('should get the last submitted transaction', async () => {
      await confirmationStore.submit('anchor-string1', 103);
      await confirmationStore.submit('anchor-string2', 104);
      await confirmationStore.submit('anchor-string3', 105);
      await confirmationStore.submit('anchor-string4', 102);
      await confirmationStore.submit('anchor-string5', 101);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 105, confirmedAt: undefined
      });
    });

    it('should return undefined if nothing has been submitted yet', async () => {
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(undefined);
    });

    it('should return confirmed once confirmed', async () => {
      await confirmationStore.submit('anchor-string1', 100);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 100, confirmedAt: undefined
      });
      await confirmationStore.confirm('anchor-string1', 101);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 100, confirmedAt: 101
      });
      await confirmationStore.submit('anchor-string2', 105);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 105, confirmedAt: undefined
      });
      await confirmationStore.confirm('anchor-string2', 106);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 105, confirmedAt: 106
      });
    });

    it('should handle reorg correctly', async () => {
      await confirmationStore.submit('anchor-string1', 100);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 100, confirmedAt: undefined
      });
      await confirmationStore.confirm('anchor-string1', 101);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 100, confirmedAt: 101
      });
      await confirmationStore.resetAfter(101);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 100, confirmedAt: 101
      });
      await confirmationStore.resetAfter(100);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 100, confirmedAt: undefined
      });
      await confirmationStore.confirm('anchor-string1', 102);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo({
        submittedAt: 100, confirmedAt: 102
      });
    });
  });
});
