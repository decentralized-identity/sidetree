import * as IPFS from 'ipfs';
import IpfsStorage from '../src/IpfsStorage';

describe('IPFSStorage', () => {
  let ipfsStorage: IpfsStorage;

  beforeEach(() => {
    ipfsStorage = IpfsStorage.create();
  });

  it('should return the pinned content for the given hash.', async () => {
    const mockIpfsContent: IPFS.Files[] = [
      {
        path: '/tmp/myfile.txt',
        content: Buffer.from('ipfs')
      }
    ];
    const mockIpfsGet = async () => {
      return mockIpfsContent;
    };
    spyOn(ipfsStorage.node, 'get').and.callFake(mockIpfsGet);
    spyOn(ipfsStorage.node.pin, 'add').and.returnValue(true);

    const expectedContent = Buffer.from('ipfs');

    const fetchedContent = await ipfsStorage.read('abc123');
    expect(expectedContent).toEqual(fetchedContent);
  });

  it('should write the content to IPFS and return the multihash.', async () => {
    const mockSidetreeContent: IPFS.IPFSFile[] = [
      {
        path: '/tmp/myfile.txt',
        hash: 'Qm12345abc',
        size: 123
      }
    ];

    const mockIpfsWrite = async () => {
      return mockSidetreeContent;
    };
    spyOn(ipfsStorage.node, 'add').and.callFake(mockIpfsWrite);

    const expectedHash = 'Qm12345abc';
    const bufferContent = Buffer.from('ipfs');

    const fetchedHash = await ipfsStorage.write(bufferContent);
    expect(expectedHash).toEqual(fetchedHash);
  });
});
