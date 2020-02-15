const IPFS = require('ipfs');
const fs = require('fs');
const fileAsString = fs.readFileSync('./test.txt', 'utf8');

const maxSizeInByte = 1000000;

async function test() {
  const node = await IPFS.create({repo: 'test'});
  let addGenerator = await node.add({path: 'file.txt', content: fileAsString})

  let chunk;
  let cidString;
  do {
    chunk = await addGenerator.next();
    console.log(chunk)
    if (!chunk.done) {
      cidString = chunk.value.cid.toString();
      console.log(`this is the cid string: ${cidString}`);
    }
  } while (!chunk.done);

  console.log('fetching...')
  const chunks = []
  // let byteOffset = 0;
  // let byteToReadAtOnce = 1000000
  let cumulativeByteLength = 0;
  console.log(await node.cat(cidString));
  for await (const chunk of node.cat(cidString)) {
    cumulativeByteLength += chunk.byteLength
    if (maxSizeInByte < cumulativeByteLength) {
      console.log('max size exceeded');
    }
    console.log(cumulativeByteLength)
    chunks.push(chunk)
  }
  return chunks;
}

test().then((data)=> {
  fs.writeFile('./test2.txt', data.toString(), (e) => {
    if(e) {
      console.log('in e');
    } else {
      console.log('file wrote');
      console.log(Buffer.from(fileAsString, 'utf8').byteLength)
    }
  })

  return 1;
}).catch((e) => {
  console.log("in error")
  console.log(e.message)
})

