Sidetree Bitcoin Service
===

*Last Updated: June 14, 2019*

A [full bitcoin node](https://bitcoincore.org/en/download/) is required by the the Sidetree Bitcoin microservice implementation. You can run the [start script](./start.sh) in this repo, which will guide and install `bitcoind` on an Ubuntu/Debian machine. The rest of this document details the steps taken by this script.

Prerequisite Software
---
### Node
`bitcoin-service` is a Node.js based project. [Download](https://nodejs.org/en/download/) or [install](https://nodejs.org/en/download/package-manager/) for your system.


> Node-Gyp is used by low level cryptography for C++ compilation. It requires Python 2.7 and the appropriate `make` and c++ compiler.
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
You will need a trusted bitcoin network peer. You can use any Bitcoin implementation so long as it supports [the standard jRPC calls](https://bitcoincore.org/en/doc/0.18.0/). Below are instructions to install a [Satoshi bitcoin client](https://bitcoincore.org/en/download/). 

Download the tarball
```bash
wget https://bitcoincore.org/bin/bitcoin-core-0.18.0/bitcoin-0.18.0-x86_64-linux-gnu.tar.gz
```

Extract the files
```
tar -xzf ./bitcoin-0.18.0-x86_64-linux-gnu.tar.gz
```

Write a configuration file named `bitcoin.conf` for your node in the root of your data folder:
```yaml
testnet=1
server=1
rpcuser={{YOUR USERNAME}}
rpcpassword={{YOUR PASSWORD}}
```

Start bitcoin
```bash
./bitcoin-0.18.0/bin/bitcoind -datadir={{YOUR DATA DIRECTORY HERE}}
```

Configure Bitcoin Service
---

Grab the IP or DNS of the machine where you installed your Bitcoin peer:

Windows users:
```cmd
ipconfig
```

Linux users:
```bash
ifconfig
```

If you installed Bitcoin locally, `localhost` will do.

In the following configuration `bcoin.local` refers to your IP address, DNS address, or `localhost` of the Bitcoin peer.

Edit your bitcoin-config.json
```json
{
  "bitcoinPeerUri": "bcoin.local:18332",
  "bitcoinRpcUsername": "{{YOUR USERNAME}}",
  "bitcoinRpcPassword": "{{YOUR PASSWORD}}",
  "bitcoinWalletImportString": "[FILL THIS IN!]",
  "bitcoinFee": 4000,
  "sidetreeTransactionPrefix": "sidetree:",
  "genesisBlockNumber": 1500000,
  "databaseName": "sidetree-bitcoin",
  "transactionFetchPageSize": 100,
  "mongoDbConnectionString": "mongodb://localhost:27017/",
  "port": 3002
}
```

> Note: 18332 is the RPC port for bitcoin testnet. If you are running on mainnet, the port should be 8332.

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
