import Config from '../../lib/core/models/Config';
import Logger from '../../lib/common/Logger';
import { MongoClient } from 'mongodb';
import MongoDb from './MongoDb';
import MongoDbLogger from '../../lib/common/MongoDbLogger';

describe('MongoDbLogger', async () => {
  const config: Config = require('../json/config-test.json');
  let mongoServiceAvailable = false;

  beforeAll(async () => {
    mongoServiceAvailable = await MongoDb.isServerAvailable(config.mongoDbConnectionString);
  });

  beforeEach(async () => {
    if (!mongoServiceAvailable) {
      pending('MongoDB service not available');
    }
  });

  it('should invoke command monitoring logger with different log level according to command response status', async () => {
    spyOn(Logger, 'info');
    spyOn(Logger, 'warn');
    spyOn(Logger, 'error');
    const client = await MongoClient.connect(config.mongoDbConnectionString, {
      useNewUrlParser: true,
      monitorCommands: true
    });
    MongoDbLogger.setCommandLogger(client);
    await expectAsync(client.db('sidetree-test').collection('service').findOne({ id: 1 })).toBeResolved();
    expect(Logger.info).toHaveBeenCalledWith(jasmine.objectContaining({ commandName: 'find' }));
    await expectAsync(client.db('sidetree-test').collection('service').dropIndex('test')).toBeRejected();
    expect(Logger.warn).toHaveBeenCalledWith(jasmine.objectContaining({ commandName: 'dropIndexes' }));
  });

  it('should invoke logger with corresponding method according to the passed state', () => {
    spyOn(Logger, 'info');
    spyOn(Logger, 'warn');
    spyOn(Logger, 'error');
    spyOn(Logger, 'debug');
    MongoDbLogger.customLogger('message', undefined);
    expect(Logger.info).not.toHaveBeenCalled();
    const state = {
      className: 'className',
      date: 0,
      message: 'message',
      pid: 0,
      type: 'debug'
    };
    MongoDbLogger.customLogger('message', state);
    expect(Logger.debug).toHaveBeenCalledWith(state);

    state.type = 'info';
    MongoDbLogger.customLogger('message', state);
    expect(Logger.info).toHaveBeenCalledWith(state);

    state.type = 'error';
    MongoDbLogger.customLogger('message', state);
    expect(Logger.error).toHaveBeenCalledWith(state);

    state.type = 'warn';
    MongoDbLogger.customLogger('message', state);
    expect(Logger.warn).toHaveBeenCalledWith(state);

    state.type = 'whatever';
    MongoDbLogger.customLogger('message', state);
    expect(Logger.info).toHaveBeenCalledWith(state);
  });
});
