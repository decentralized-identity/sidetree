/**
 * Example code on how to generate load files for Vegeta load testing tool.
 */
import VegetaLoadGenerator from './VegetaLoadGenerator';

const uniqueDidCount = 20000;
const endpointUrl = 'http://localhost:3000/';
const outputFolder = `d:/vegeta-localhost-jws`;

(async () => {
  console.info(`Generating load requests...`);
  const startTime = process.hrtime(); // For calculating time taken to process operations.
  await VegetaLoadGenerator.generateLoadFiles(uniqueDidCount, endpointUrl, outputFolder);
  const duration = process.hrtime(startTime);
  console.info(`Generated requests. Time taken: ${duration[0]} s ${duration[1] / 1000000} ms.`);
})();
