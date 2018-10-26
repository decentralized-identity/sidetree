import * as Ipfs from 'ipfs';
import { IpfsStorage } from '../../src/lib/IpfsStorage';

describe('IpfsStorage', () => {
  let ipfsStorage: IpfsStorage;

  beforeEach(() => {
    const ipfsOptions: Ipfs.Options = {
      repo: 'sidetree-ipfs',
      init: false,
      start: false
    };

    ipfsStorage = IpfsStorage.create(ipfsOptions);
  });

  it('should return the pinned content for the given hash.', async () => {
    const mockIpfsContent: Ipfs.Files[] = [
      {
        path: '/tmp/myfile.txt',
        content: Buffer.from('ipfs')
      }
    ];
    const mockIpfsGet = async () => {
      return mockIpfsContent;
    };
    spyOn(ipfsStorage.node.files, 'get').and.callFake(mockIpfsGet);

    const expectedContent = Buffer.from('ipfs');

    const fetchedContent = await ipfsStorage.read('abc123');
    expect(expectedContent).toEqual(fetchedContent);
  });

  it('should write the content to IPFS and return the multihash.', async () => {
    const mockSidetreeContent: Ipfs.IPFSFile[] = [
      {
        path: '/tmp/myfile.txt',
        hash: 'Qm12345abc',
        size: 123
      }
    ];

    const mockIpfsWrite = async () => {
      return mockSidetreeContent;
    };
    spyOn(ipfsStorage.node.files, 'add').and.callFake(mockIpfsWrite);

    const expectedHash = 'Qm12345abc';
    const bufferContent = Buffer.from('ipfs');

    const fetchedHash = await ipfsStorage.write(bufferContent);
    expect(expectedHash).toEqual(fetchedHash);
  });
});
