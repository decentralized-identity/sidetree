Bitcoin Service
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
Write a configuration file for your node (`bcoin.conf`):
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

> You may wish to remove `--daemon` on first start up to ensure your configuration is taking affect, and wait to start the bitcoin service until fully synced.

Configure Bitcoin Service
---

Grab the IP or DNS of the machine where you installed Bcoin:

Windows users:
```cmd
ipconfig
```

Linux users:
```bash
ifconfig
```

If you installed Bcoin locally, `localhost` will do.

In the following configuration `bcoin.local` refers to your IP address, DNS address, or `localhost`.

Edit your bitcoin-config.json
```json
{
  "bitcoinExtensionUri": "http://bcoin.local:18331/",
  "bitcoinWalletImportString": "[FILL THIS IN]",
  "sidetreeTransactionPrefix": "sidetree:",
  "genesisBlockNumber": 1480000,
  "genesisBlockHash": "00000000000001571bc6faf951aeeb5edcbbd9fd3390be23f8ee7ccc2060d591",
  "databaseName": "sidetree-bitcoin",
  "transactionFetchPageSize": 10,
  "mongoDbConnectionString": "mongodb://localhost:27017/",
  "port": 3002
}
```

If you are on mainnet or already have a bitcoin testnet private key, please put the
[Wallet Import Format](https://en.bitcoin.it/wiki/Wallet_import_format)(WIF) string in the `bitcoinWalletImportString`
parameter.

If you are running the bitcoin sample service **FOR TESTNET**, starting it now will result in an error:
```bash
$ npm run bitcoin

> @decentralized-identity/sidetree@0.1.9 bitcoin
> node dist/src/bitcoin.js

Missing bitcoinWalletImportString. Consider using...
cQhzURdWoezaxFEiupBJcPWKmpvR3fZCtscDZnwdvsg7jJeXzHY6
npm ERR! errno 1
npm ERR! @decentralized-identity/sidetree@0.1.9 bitcoin: `node dist/src/bitcoin.js`
npm ERR! Exit status 1
```

Please note the `cQhzURdWoezaxFEiupBJcPWKmpvR3fZCtscDZnwdvsg7jJeXzHY6`. This sample is designed to return
a WIF string as a suggestion to generating one. Copy this string and paste it in the value for `bitcoinWalletImportString`.

You should now be able to run the sample. The bitcoin service will take around 5 minutes to syncronize from genesis, during this time it will not respond to requests.

On the first attempt to write to Bitcoin, you will see the error:
```bash
Please Fund Wallet: my8HhaAqfCiRufQKdT7CBRKUDsArL7ijRT
```

Please go online to a testnet [faucet](https://en.bitcoin.it/wiki/Bitcoin_faucet) and fund the given address.
You will have to perform this action periodically, depending on your wallet funds.