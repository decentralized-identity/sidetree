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

echo "Installing prerequisite software"
# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Install Node v.10 ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
sudo snap install node --classic --channel=10
if [ $? != 0 ]; then
    echo "Snapcraft failed, using apt..."
    curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Install build essentials and git ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
sudo apt-get install gcc g++ make git -y

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Install bitcoin as a peer2peer peer ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
sudo snap install bitcoin-core
if [ $? != 0 ]; then
    echo "Snapcraft failed, using apt..."
    cd $dataDirectory
    wget https://bitcoincore.org/bin/bitcoin-core-0.18.0/bitcoin-0.18.0-x86_64-linux-gnu.tar.gz
    if [ $? != 0 ]; then
        echo "Failed to download bitcoin client. Please visit https://bitcoincore.org/en/download/ and download the client manually"
        exit 1
    fi
    tar -xzf ./bitcoin-0.18.0-x86_64-linux-gnu.tar.gz
fi

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Generate an RPC password ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
if [[ -e /dev/urandom ]]; then
    password=$(head -c 32 /dev/urandom | base64 -)
else
    password=$(head -c 32 /dev/random | base64 -)
fi

cd $dataDirectory
echo "
testnet=1
server=1
rpcuser=admin
rpcpassword=$password
" > $dataDirectory/bitcoin.conf

echo "Your RPC username is 'admin'"
echo "Your RPC password is '$password'"

echo "
#!/bin/bash
./bitcoin-0.18.0/bin/bitcoind -datadir$dataDirectory
" > $dataDirectory/start.sh
chmod u+x $dataDirectory/start.sh
./bitcoin-0.18.0/bin/bitcoind -datadir$dataDirectory/bcoin.conf
