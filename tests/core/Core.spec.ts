import ServiceVersionModel from "../../lib/common/models/ServiceVersionModel";
import Core from "../../lib/core/Core";
import Config from "../../lib/core/models/Config";
import { ProtocolVersionModel } from "../../lib/core/VersionManager";
import { ResponseStatus } from "../../lib/common/Response";

describe('Core', async () => {

    function getMockConfig() : Config {
        return {
            batchingIntervalInSeconds: 1, 
            blockchainServiceUri: 'https://blockchainuri', 
            contentAddressableStoreServiceUri: 'https://casuri',
            didMethodName: 'sidetree', 
            maxConcurrentDownloads: 2, 
            observingIntervalInSeconds: 5,
            mongoDbConnectionString: 'db:connectionstring'
        };
    }

    function getMockProtocolVersionModels() : ProtocolVersionModel[] {
        return [ {startingBlockchainTime: 1000, version: '0.4.0'} ];
    }

    describe('handleGetVersionRequest()', async () => {
        it('should call all the dependent services', async () => {
            
            // Keep the 'name' property on the following model objects. The name is used to sort
            // the values alphabetically to validate the response later on.
            const expectedCoreVersion: ServiceVersionModel = { name: 'a-service', version: 'x.y.z' };
            const expectedBlockchainVersion: ServiceVersionModel = { name: 'b-service', version: 'a.b.c' };
            const expectedCasVersion: ServiceVersionModel = { name: 'c-service', version: '1.x.c' };
        
            const core = new Core(getMockConfig(), getMockProtocolVersionModels());

            const serviceInfoSpy = spyOn(core['serviceInfo'], 'getServiceVersion').and.returnValue(expectedCoreVersion);
            const blockchainSpy = spyOn(core['blockchain'], 'getCachedServiceVersion').and.returnValue(expectedBlockchainVersion);
            const casSpy = spyOn(core['cas'], 'getCachedServiceVersion').and.returnValue(expectedCasVersion);

            const fetchedResponse = await core.handleGetVersionRequest();          

            expect(serviceInfoSpy).toHaveBeenCalled();
            expect(blockchainSpy).toHaveBeenCalled();
            expect(casSpy).toHaveBeenCalled();
            expect(fetchedResponse.status).toEqual(ResponseStatus.Succeeded);

            // Sort the output to make it easier to validate
            let fetchedVersions: ServiceVersionModel[] = JSON.parse(fetchedResponse.body);
            fetchedVersions.sort((a, b) => a.name > b.name ? 1 : -1);

            expect(fetchedVersions[0]).toEqual(expectedCoreVersion);
            expect(fetchedVersions[1]).toEqual(expectedBlockchainVersion);
            expect(fetchedVersions[2]).toEqual(expectedCasVersion);
        });
    });
});