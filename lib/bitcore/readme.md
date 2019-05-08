Bitcore
===

*Last Updated: May 8, 2019*

A [full Bitcore node](https://github.com/bitpay/bitcore#bitcore) is required by the the bitcoin sidetree implementation I.O.N. A [start script](./start.sh) in this repo will guide and install bitcore on an Ubuntu 18.04 machine. The rest of this document details the steps taken by this script.

Prerequisite Software
---
### Node
Bitcore is a Node.js based project. [Download](https://nodejs.org/en/download/) or [install](https://nodejs.org/en/download/package-manager/) for your system.


> Node-Gyp is used by bitcore for C++ compilation. It requires Python 2.7 and the appropriate `make` and c++ compiler.
### Python 2.7 for Windows
[Python 2.7 Downloads](https://www.python.org/download/releases/2.7/)
### Python 2.7 for Linux
`sudo apt-get install -y python`
### C++ Compilers for Windows
[Tools for Visual Studio {Current Year}](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2019)
### C++ Compilers for Linux
`sudo apt-get install -y gcc g++ make`

### MongoDB
Bitcore uses MongoDB to store blockchain related data. [Install one locally](https://www.mongodb.com/download-center/community) (Linux users may wish to refer to their [manual](https://docs.mongodb.com/manual/administration/install-on-linux/)) or have one set up for your information.

Bitcoin peer
---
You will need a trusted bitcoin network peer. You can point to any node, however Bitcore's stability will rely on this node. Below are instructions to install a [Bcoin bitcoin node](https://github.com/Bcoin-org/Bcoin). 
### Bcoin (Optional)
Bcoin 
Clone their repo
```bash
git clone https://github.com/bitpay/bitcore.git
```
Install Bcoin dependencies:
```bash
npm install
```
Configure your node:
```yaml
network: testnet
prefix: {{ DATA DIRECTORY HERE }}
host: 127.0.0.1
port: 18332
workers-size: 1
```
Start Bcoin:
```bash
./bin/bcoin --config {{ CONFIG FILEPATH HERE }} --daemon
```

Bitcore
---
Clone the repo
```bash
git clone https://github.com/bitpay/bitcore.git
```
Install the dependencies
```bash
npm install
```
Write an appropriate configuration:
```json
{
  "bitcoreNode": {
    "chains": {
      "BTC": {
        "testnet": {
          "chainSource": "p2p",
          "trustedPeers": [
            {
              "host": "127.0.0.1",
              "port": 18332
            }
          ]
        }
      }
    },
    "port": 3000,
    "dbHost": "localhost",
    "dbPort": "27017",
    "dbName": "bitcore",
    "dbUser": "",
    "dbPass": ""
  }
}
```
Set an environment variable for the configuration:
```bash
export BITCORE_CONFIG_PATH="{{ CONFIG FILEPATH HERE }}"
```
Run the node
```bash
npm run node
```