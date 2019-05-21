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

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Install bcoin as a peer2peer peer ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
cd $dataDirectory
git clone git://github.com/bcoin-org/bcoin.git
cd bcoin
npm install
echo "
network: testnet
prefix: $dataDirectory/data/bcoin/
host: 127.0.0.1
port: 18332
http-port: 18331
workers-size: 1
index-address: true
" > $dataDirectory/data/bcoin/bcoin.conf
./bin/bcoin --config $dataDirectory/data/bcoin/bcoin.conf --daemon
