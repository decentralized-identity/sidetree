Sidetree Bitcoin Service
===

*Last Updated: June 18, 2019*

A [full bitcoin node](https://bitcoincore.org/en/download/) is required by the the Sidetree Bitcoin microservice implementation. You can run the [install script](./setup.sh) in this repo, which will guide and install `bitcoind`. The rest of this document details the steps taken by this script.

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

Configure Sidetree Bitcoin Service
---

Example bitcoin-config.json
```json
{
  "bitcoinPeerUri": "http://localhost:18332",
  "bitcoinRpcUsername": "{{YOUR USERNAME}}",
  "bitcoinRpcPassword": "{{YOUR PASSWORD}}",
  "bitcoinWalletImportString": "[FILL THIS IN!]",
  "sidetreeTransactionPrefix": "sidetree:",
  "genesisBlockNumber": 1500000,
  "databaseName": "sidetree-bitcoin",
  "transactionFetchPageSize": 100,
  "mongoDbConnectionString": "mongodb://localhost:27017/",
  "port": 3002
}
```


### Specify bitcoin peer URI
Grab the IP or DNS of the machine where you installed your Bitcoin peer:

Windows users:
```cmd
ipconfig
```

Linux users:
```bash
ifconfig
```

Update the `bitcoinPeerUri` parameter in the `bitcoin-config.json`.

> Note: 18332 is the RPC port for bitcoin testnet. If you are running on mainnet, the port should be 8332.

### Specify bitcoin wallet private key

Put your private key in [Wallet Import Format](https://en.bitcoin.it/wiki/Wallet_import_format) (WIF) in the `bitcoinWalletImportString` parameter.

Please ensure that your wallet contain sufficient funds for write operations, else you will see the error:
```bash
Please Fund Wallet: my8HhaAqfCiRufQKdT7CBRKUDsArL7ijRT
```

If you are testing on testnet, you can use a testnet [faucet](https://en.bitcoin.it/wiki/Bitcoin_faucet) to fund a given wallet address. You will have to perform this action periodically, depending on your wallet funds.


### Specify PRC user name and password

Add the RPC user name and password to the `bitcoinRpcUsername` and `bitcoinRpcPassword` parameters if your bitcoin peer requires it for RPC communication (Bitcoin Core requires it).

You should now be able to run the Sidetree bictoin service. The bitcoin service will take sometime to syncronize from genesis, during this time it will not respond to requests.
