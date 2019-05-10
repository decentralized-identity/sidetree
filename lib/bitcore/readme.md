Bitcoin Full Node
===

*Last Updated: May 10, 2019*

A [full bitcoin node](https://github.com/Bcoin-org/Bcoin#bcoin) is required by the the bitcoin sidetree implementation I.O.N. A [start script](./start.sh) in this repo will guide and install bitcore on an Ubuntu/Debian machine. The rest of this document details the steps taken by this script.

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

Bitcoin peer
---
You will need a trusted bitcoin network peer. ~~You can use any Bitcoin implementation so long as it supports http RPC~~ (There are a few proprietary BCoin calls being used for convinence. You can use any node once those have been refactored). Below are instructions to install a [Bcoin bitcoin node](https://github.com/Bcoin-org/Bcoin). 
### Bcoin
Bcoin 
Clone their repo
```bash
git clone git://github.com/bcoin-org/bcoin.git
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
http-port: 18331
workers-size: 1
index-address: true
```
Start Bcoin:
```bash
./bin/bcoin --config {{ CONFIG FILEPATH HERE }} --daemon
```
