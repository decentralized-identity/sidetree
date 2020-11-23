import Compressor from '../../../lib/core/versions/latest/util/Compressor';
import ErrorCode from '../../../lib/core/versions/latest/ErrorCode';
import SidetreeError from '../../../lib/common/SidetreeError';

describe('Compressor', async () => {

  const randomJsonStr = '[{"_id":"5d8ab8a8830c0abddb5b78fa","index":0,"guid":"3ca7c150-96df-4635-a3d4-78106f80ae57","isActive":false,"balance":"$1,137.88","picture":"http://placehold.it/32x32","age":22,"eyeColor":"brown","name":"Miller Hubbard","gender":"male","company":"SQUISH","email":"millerhubbard@squish.com","phone":"+1 (946) 412-3010","address":"764 Revere Place, Hobucken, New Hampshire, 5635","about":"Excepteur laboris nostrud ad velit consectetur est enim ad occaecat. Esse nulla labore exercitation Lorem eiusmod labore occaecat et eiusmod. Duis adipisicing excepteur tempor minim culpa. Culpa qui excepteur est Lorem fugiat ex ipsum ipsum reprehenderit ut elit.\r\n","registered":"2014-11-07T12:36:08 +08:00","latitude":-1.993768,"longitude":68.377665,"tags":["velit","anim","non","est","dolor","sint","non"],"friends":[{"id":0,"name":"Cain Spence"},{"id":1,"name":"Whitney Armstrong"},{"id":2,"name":"Corina Hill"}],"greeting":"Hello, Miller Hubbard! You have 10 unread messages.","favoriteFruit":"strawberry"},{"_id":"5d8ab8a88f88396568234ac3","index":1,"guid":"214fcda5-c90b-49af-88bd-bdd04a9a380d","isActive":true,"balance":"$3,312.59","picture":"http://placehold.it/32x32","age":23,"eyeColor":"brown","name":"Laurel Fowler","gender":"female","company":"WAAB","email":"laurelfowler@waab.com","phone":"+1 (918) 536-3038","address":"803 Gaylord Drive, Yardville, Wyoming, 3533","about":"Laboris tempor incididunt aute excepteur veniam nisi duis incididunt irure non elit. Sunt cillum elit proident Lorem et deserunt. Eiusmod laboris in fugiat enim ut ex ullamco dolore pariatur nulla elit amet commodo consectetur. Ad pariatur officia aliqua veniam aliqua aliqua mollit et reprehenderit. Fugiat ex eu nulla in incididunt ipsum.\r\n","registered":"2015-06-07T10:56:21 +07:00","latitude":24.281033,"longitude":-152.941874,"tags":["irure","irure","amet","labore","irure","amet","esse"],"friends":[{"id":0,"name":"West Watson"},{"id":1,"name":"Blanche Nunez"},{"id":2,"name":"Rowena Herring"}],"greeting":"Hello, Laurel Fowler! You have 4 unread messages.","favoriteFruit":"apple"},{"_id":"5d8ab8a8a2059e8993e988a3","index":2,"guid":"a9964db5-ccfb-46b8-8f1b-5add56a50506","isActive":true,"balance":"$2,468.56","picture":"http://placehold.it/32x32","age":21,"eyeColor":"green","name":"Jackie Harmon","gender":"female","company":"TALAE","email":"jackieharmon@talae.com","phone":"+1 (814) 599-2468","address":"787 Montrose Avenue, Thornport, Kentucky, 2909","about":"Irure enim enim esse ea. Aliqua duis quis dolor exercitation adipisicing. Irure sit ut cillum tempor in. Adipisicing voluptate proident esse velit pariatur irure veniam adipisicing.\r\n","registered":"2018-10-27T03:07:46 +07:00","latitude":-2.599657,"longitude":156.747649,"tags":["deserunt","do","ea","cillum","est","anim","consectetur"],"friends":[{"id":0,"name":"Valencia Mercado"},{"id":1,"name":"Liz Glass"},{"id":2,"name":"Ewing Albert"}],"greeting":"Hello, Jackie Harmon! You have 3 unread messages.","favoriteFruit":"banana"},{"_id":"5d8ab8a82f4d7b2cef511302","index":3,"guid":"585464dd-d158-467b-9c08-6adca9fc283b","isActive":false,"balance":"$1,247.19","picture":"http://placehold.it/32x32","age":29,"eyeColor":"blue","name":"Julie Cabrera","gender":"female","company":"COMVENE","email":"juliecabrera@comvene.com","phone":"+1 (831) 487-3926","address":"147 Bragg Court, Caledonia, Mississippi, 4104","about":"Est ullamco aute adipisicing et nisi consectetur enim nostrud. Aliquip ex amet culpa et consequat. Nulla irure aliqua enim labore irure Lorem ad voluptate culpa cupidatat sit minim. Exercitation sit excepteur ullamco ipsum laboris anim cupidatat.\r\n","registered":"2017-09-01T07:46:49 +07:00","latitude":-73.806724,"longitude":-144.051724,"tags":["proident","ea","excepteur","excepteur","nulla","aute","est"],"friends":[{"id":0,"name":"Espinoza Knight"},{"id":1,"name":"White Kent"},{"id":2,"name":"Mollie Davis"}],"greeting":"Hello, Julie Cabrera! You have 2 unread messages.","favoriteFruit":"strawberry"},{"_id":"5d8ab8a808ad575f8eab6d59","index":4,"guid":"d25af691-1341-42d4-a29a-436e96d644ae","isActive":false,"balance":"$2,836.74","picture":"http://placehold.it/32x32","age":32,"eyeColor":"brown","name":"Rosalyn Obrien","gender":"female","company":"NURALI","email":"rosalynobrien@nurali.com","phone":"+1 (809) 526-2383","address":"493 Kosciusko Street, Weogufka, Colorado, 5718","about":"Duis id ex reprehenderit laborum nulla dolor nulla dolore aute pariatur in est. Ut esse laboris laboris ullamco officia tempor ullamco. Ipsum excepteur laborum est proident nisi ullamco duis eiusmod. Pariatur ea dolor elit eu. Commodo pariatur incididunt fugiat duis non excepteur. Adipisicing aute officia dolore mollit cupidatat. Laborum tempor nostrud est mollit elit anim amet do aute sit in ullamco ea deserunt.\r\n","registered":"2016-02-07T12:07:09 +08:00","latitude":65.040319,"longitude":-125.360617,"tags":["nostrud","nostrud","aliquip","consequat","ipsum","esse","cillum"],"friends":[{"id":0,"name":"Bowen Morrison"},{"id":1,"name":"Garner Arnold"},{"id":2,"name":"Rosie Rice"}],"greeting":"Hello, Rosalyn Obrien! You have 9 unread messages.","favoriteFruit":"apple"},{"_id":"5d8ab8a8ba235f5be3fcead8","index":5,"guid":"cd3f9162-7c09-4d61-a618-f4e25ebb67ee","isActive":true,"balance":"$2,139.61","picture":"http://placehold.it/32x32","age":32,"eyeColor":"brown","name":"Chelsea Lynn","gender":"female","company":"GRUPOLI","email":"chelsealynn@grupoli.com","phone":"+1 (954) 540-3336","address":"220 Beaver Street, Sidman, Arizona, 6597","about":"Labore exercitation labore occaecat et excepteur nisi commodo reprehenderit sint. Sunt tempor amet velit minim fugiat irure anim reprehenderit aliquip proident qui reprehenderit anim. Consequat dolore deserunt nostrud Lorem proident Lorem nisi.\r\n","registered":"2015-09-16T11:04:15 +07:00","latitude":19.274155,"longitude":-148.17196,"tags":["do","adipisicing","ea","pariatur","esse","commodo","aute"],"friends":[{"id":0,"name":"Thornton Cote"},{"id":1,"name":"Melba Reese"},{"id":2,"name":"Galloway Conrad"}],"greeting":"Hello, Chelsea Lynn! You have 1 unread messages.","favoriteFruit":"banana"}]';

  it('should compress and decompress as Buffer correctly.', async () => {
    const inputAsBuffer = Buffer.from(randomJsonStr);
    const compressedBuffer = await Compressor.compress(inputAsBuffer);
    const decompressedBuffer = await Compressor.decompress(compressedBuffer, 100000);

    expect(decompressedBuffer).toEqual(inputAsBuffer);
  });

  it('Should throw error if decompressed data exceeds maximum size specified.', async (done) => {
    // Generat a 100MB buffer with just 1's in it.
    const decompressedBufferSize = 100000000;
    const uncompressedBuffer = Buffer.alloc(decompressedBufferSize);
    for (let i = 0; i < uncompressedBuffer.length; i++) {
      uncompressedBuffer[i] = 49; // 49 is ASCII value for '1'.
    }

    const compressedBuffer = await Compressor.compress(uncompressedBuffer);

    const maxAllowedDecompressedSizeInBytes = 100000; // 100KB
    try {
      await Compressor.decompress(compressedBuffer, maxAllowedDecompressedSizeInBytes);
    } catch (error) {
      // Expect Sidetree error.
      if (error instanceof SidetreeError &&
        error.code === ErrorCode.CompressorMaxAllowedDecompressedDataSizeExceeded) {

        // Further check the error message to ensure that the decompressed bytes are less than the fully decompressed data size,
        // to ensure that "chunking" is taking place.

        // Parsing out the bytes decompressed from error message.
        // NOTE: Error message looks like: 'Max data size allowed: 100000 bytes, aborted decompression at 114688 bytes.`
        let message = error.message;
        message = message.substring(0, message.length - 6); // Removing the trailing 'bytes.' string.
        const bytesDecompressed = Number.parseInt(message.substring(message.indexOf('at ') + 3), 10); // Base 10.

        // NOTE: bytes decompressed will go over the max allowed size since that's the error condition.
        // But it should not go over too much (default decompressed chunks in gunzip lib are ~16K),
        // in the test we allow total decompressed data to go over max allowed size by no more than 2x for simplicity,
        // which is still a tiny fraction of the original data size.
        if (bytesDecompressed > maxAllowedDecompressedSizeInBytes * 2) {
          fail();
        }
      } else {
        throw error; // Unexpected error, throw to fail the test.
      }
    }

    done();
  });
});
