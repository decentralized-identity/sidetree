import * as Ipfs from 'ipfs';
import { IpfsStorage } from '../../src/lib/IPFSStorage';

describe('IPFSStorage', () => {
  let ipfsStorage: IpfsStorage;

  beforeEach(() => {
    let ipfsOptions: Ipfs.Options = {
      repo: 'sidetree-ipfs',
      init: false,
      start: false
    };

    ipfsStorage = IpfsStorage.createIPFSNode(ipfsOptions);
  });

  it('should return the pinned content for the given hash.', async ()=> {
    let mockIpfsContent: Ipfs.Files[] = [
      {
        path: '/tmp/myfile.txt',
        content: Buffer.from('ipfs')
      }
    ];
    let mockIpfsGet = async () => {
      return mockIpfsContent;
    }
    spyOn(ipfsStorage.node.files, 'get').and.callFake(mockIpfsGet);
    
    let expectedContent = Buffer.from('ipfs');
    
    let fetchedContent = await ipfsStorage.read('abc123');
    expect(expectedContent).toEqual(fetchedContent);
  });

  it('should write the content to IPFS and return the multihash.', async ()=> {
    let mockSidetreeContent: Ipfs.IPFSFile[] = [
      {
        path: '/tmp/myfile.txt',
        hash: 'Qm12345abc',
        size: 123,
      }
    ]
  
    let mockIpfsWrite = async () => {
      return mockSidetreeContent;
    }
    spyOn(ipfsStorage.node.files, 'add').and.callFake(mockIpfsWrite);
    
    let expectedHash = 'Qm12345abc';
    let bufferContent = Buffer.from('ipfs');
    
    let fetchedHash = await ipfsStorage.write(bufferContent)
    expect(expectedHash).toEqual(fetchedHash);
  });
});