import ServiceInfo from '../../lib/common/ServiceInfoProvider';

describe('ServiceInfoProvider', () => {

  it('should return the version from the package.json file.', async () => {
    const packageJson = require('../../package.json');

    const serviceInfo = new ServiceInfo('test-service');
    const serviceVersion = serviceInfo.getServiceVersion();

    expect(serviceVersion.name).toEqual('test-service');
    expect(serviceVersion.version).toEqual(packageJson.version);
  });
});
