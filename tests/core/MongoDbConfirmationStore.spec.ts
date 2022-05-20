import Config from '../../lib/core/models/Config';
import { ConfirmationModel } from '../../lib/core/interfaces/IConfirmationStore';
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

  let confirmationStore: MongoDbConfirmationStore;
  beforeAll(async () => {
    await MongoDb.createInmemoryDb(config);
    confirmationStore = await createConfirmationStore(config.mongoDbConnectionString, databaseName);
  });

  beforeEach(async () => {
    await confirmationStore.clearCollection();
  });

  describe('getLastSubmitted', () => {
    it('should get the last submitted transaction', async () => {
      await confirmationStore.submit('anchor-string1', 103);
      await confirmationStore.submit('anchor-string2', 104);
      await confirmationStore.submit('anchor-string3', 105);
      await confirmationStore.submit('anchor-string4', 102);
      await confirmationStore.submit('anchor-string5', 101);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 105, anchorString: 'anchor-string3'
      }));
    });

    it('should return undefined if nothing has been submitted yet', async () => {
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(undefined);
    });

    it('should return confirmed once confirmed', async () => {
      await confirmationStore.submit('anchor-string1', 100);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 100, anchorString: 'anchor-string1'
      }));
      await confirmationStore.confirm('anchor-string1', 101);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 100, confirmedAt: 101, anchorString: 'anchor-string1'
      }));
      await confirmationStore.submit('anchor-string2', 105);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 105, anchorString: 'anchor-string2'
      }));
      await confirmationStore.confirm('anchor-string2', 106);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 105, confirmedAt: 106, anchorString: 'anchor-string2'
      }));
    });

    it('should clear the collections using afterReset with undefined args', async () => {
      await confirmationStore.submit('anchor-string1', 100);
      await confirmationStore.confirm('anchor-string1', 101);
      await confirmationStore.submit('anchor-string2', 110);
      await confirmationStore.resetAfter(undefined);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 110, anchorString: 'anchor-string2'
      }));
    });

    it('should handle reorg correctly', async () => {
      await confirmationStore.submit('anchor-string1', 100);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 100, anchorString: 'anchor-string1'
      }));
      await confirmationStore.confirm('anchor-string1', 101);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 100, confirmedAt: 101, anchorString: 'anchor-string1'
      }));
      await confirmationStore.resetAfter(101);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 100, confirmedAt: 101, anchorString: 'anchor-string1'
      }));
      await confirmationStore.resetAfter(100);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 100, anchorString: 'anchor-string1'
      }));
      await confirmationStore.confirm('anchor-string1', 102);
      await expectAsync(confirmationStore.getLastSubmitted()).toBeResolvedTo(jasmine.objectContaining<ConfirmationModel|undefined>({
        submittedAt: 100, confirmedAt: 102, anchorString: 'anchor-string1'
      }));
    });
  });
});
