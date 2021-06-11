import IServiceStateStore from '../../lib/common/interfaces/IServiceStateStore';
import ServiceStateModel from '../../lib/core/models/ServiceStateModel';

export default class MockServiceStateStore implements IServiceStateStore<ServiceStateModel> {
    private serviceState = {};

    async put (serviceState: ServiceStateModel) {
      this.serviceState = serviceState;
    }

    public async get (): Promise<ServiceStateModel> {
      return this.serviceState;
    }
}
