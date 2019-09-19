import ServiceInfo from '../../lib/common/ServiceInfoProvider';

describe('ServiceInfoProvider', () => {

  it('should return the version from the package.json file.', async () => {
    const packageJson = require('../../package.json');

    let serviceInfo = new ServiceInfo('test-service');
    const serviceVersion = serviceInfo.getServiceVersion();

    expect(serviceVersion.name).toEqual('test-service');
    expect(serviceVersion.version).toEqual(packageJson.version);
  });

  it('should validate the empty service version.', async () => {

    const emptyServiceVersion = ServiceInfo.getEmptyServiceVersion();

    expect(ServiceInfo.isEmptyServiceVersionModel(emptyServiceVersion)).toEqual(true);
  });
});
