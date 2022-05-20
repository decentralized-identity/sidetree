import Config from '../../lib/core/models/Config';
import Logger from '../../lib/common/Logger';
import { MongoClient } from 'mongodb';
import MongoDb from './MongoDb';
import MongoDbStore from '../../lib/common/MongoDbStore';

describe('MongoDbStore', async () => {
  const config: Config = require('../json/config-test.json');

  beforeAll(async () => {
    await MongoDb.createInmemoryDb(config);
  });

  beforeEach(async () => {
  });

  it('should invoke command monitoring logger with different log level according to command response status', async () => {
    spyOn(Logger, 'info');
    spyOn(Logger, 'warn');
    spyOn(Logger, 'error');
    const client = await MongoClient.connect(config.mongoDbConnectionString, {
      useNewUrlParser: true,
      monitorCommands: true
    });
    MongoDbStore.enableCommandResultLogging(client);
    await expectAsync(client.db('sidetree-test').collection('service').findOne({ id: 1 })).toBeResolved();
    expect(Logger.info).toHaveBeenCalledWith(jasmine.objectContaining({ commandName: 'find' }));
    await expectAsync(client.db('sidetree-test').collection('service').dropIndex('test')).toBeRejected();
    expect(Logger.warn).toHaveBeenCalledWith(jasmine.objectContaining({ commandName: 'dropIndexes' }));
    client.emit('commandSucceeded', { commandName: 'ping' });
    expect(Logger.info).not.toHaveBeenCalledWith(jasmine.objectContaining({ commandName: 'ping' }));
  });

  it('should invoke logger with corresponding method according to the passed state', () => {
    spyOn(Logger, 'info');
    spyOn(Logger, 'warn');
    spyOn(Logger, 'error');
    MongoDbStore.customLogger('message', undefined);
    expect(Logger.info).not.toHaveBeenCalled();
    const state = {
      className: 'className',
      date: 0,
      message: 'message',
      pid: 0,
      type: 'debug'
    };

    state.type = 'info';
    MongoDbStore.customLogger('message', state);
    expect(Logger.info).toHaveBeenCalledWith(state);

    state.type = 'error';
    MongoDbStore.customLogger('message', state);
    expect(Logger.error).toHaveBeenCalledWith(state);

    state.type = 'whatever';
    MongoDbStore.customLogger('message', state);
    expect(Logger.info).toHaveBeenCalledWith(state);
  });
});
