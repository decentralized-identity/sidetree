#!/bin/bash

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Get data directory ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
echo -n "Directory for blockchain data: "
read dataDirectory
if [[ ! -d $dataDirectory ]]; then 
    echo "$dataDirectory is not a directory"
    exit 1
fi
if [[ ! -w $dataDirectory ]]; then
    echo "Cannot write in $dataDirectory"
    exit 1
fi

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Install bitcoin as a peer2peer peer ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
snapCraftInstall=1
sudo snap install bitcoin-core
if [ $? != 0 ]; then
    echo "Snapcraft failed, using apt..."
    snapCraftInstall=0
    cd $dataDirectory
    wget https://bitcoincore.org/bin/bitcoin-core-0.18.0/bitcoin-0.18.0-x86_64-linux-gnu.tar.gz
    if [ $? != 0 ]; then
        echo "Failed to download bitcoin client. Please visit https://bitcoincore.org/en/download/ and download the client manually"
        exit 1
    fi
    tar -xzf ./bitcoin-0.18.0-x86_64-linux-gnu.tar.gz
    rm ./bitcoin-0.18.0-x86_64-linux-gnu.tar.gz
fi

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Generate an RPC password ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
if [[ -e /dev/urandom ]]; then
    password=$(head -c 32 /dev/urandom | base64 -)
else
    password=$(head -c 32 /dev/random | base64 -)
fi

echo "
testnet=1
server=1
rpcuser=admin
rpcpassword=$password
" > $dataDirectory/bitcoin.conf


if [[ $snapCraftInstall == 0 ]]; then
    echo "
    #!/bin/bash
    ./bitcoin-0.18.0/bin/bitcoind -datadir=$dataDirectory
    " > $dataDirectory/start.sh
else
    echo "
    #!/bin/bash
    bitcoind -datadir=$dataDirectory
    " > $dataDirectory/start.sh
fi;
chmod u+x $dataDirectory/start.sh

echo "╭───────────────────╮"
echo "│ Install complete! │"
echo "╰───────────────────╯"
echo "Your RPC username is 'admin'"
echo "Your RPC password is '$password'"
echo "Please use this for your bitcoin-config.json"
echo "
{
  \"bitcoinPeerUri\": \"http://localhost:18332\",
  \"bitcoinRpcUsername\": \"admin\",``
  \"bitcoinRpcPassword\": \"$password\",
  \"bitcoinWalletImportString\": \"[FILL THIS IN!]\",
  \"sidetreeTransactionPrefix\": \"[FILL THIS IN!]:\",
  \"genesisBlockNumber\": 1500000,
  \"databaseName\": \"sidetree-bitcoin\",
  \"transactionFetchPageSize\": 100,
  \"mongoDbConnectionString\": \"mongodb://localhost:27017/\",
  \"port\": 3002
}"
