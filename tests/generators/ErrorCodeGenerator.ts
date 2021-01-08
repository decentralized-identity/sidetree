import * as fs from 'fs';
import * as path from 'path';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';

// Auto-generates error code messages based on the enum value and overwrites the original error code file.

const errorCodeFileName = 'ErrorCode.ts';
const latestVersionPath = '../../../lib/core/versions/latest';
const latestVersionDirectory = path.resolve(__dirname, latestVersionPath);
const saveLocation = path.resolve(__dirname, `${latestVersionPath}/${errorCodeFileName}`);

/**
 * Returns true if ErrorCode is used in ts files
 */
function isErrorCodeReferencedInDicrectory (errorCode: string, path: string): boolean {
  const directory = fs.readdirSync(path);
  for (const fileOrSubDirectory of directory) {
    if (isErrorCodeFile(fileOrSubDirectory)) {
      continue;
    } else if (isTsFile(fileOrSubDirectory)) {
      const file = fs.readFileSync(`${path}/${fileOrSubDirectory}`, 'utf-8');
      if (file.includes(errorCode)) {
        return true;
      }
    } else if (!fileOrSubDirectory.includes('.')) {
      try {
        if (isErrorCodeReferencedInDicrectory(errorCode, `${path}/${fileOrSubDirectory}`)) {
          return true;
        }
      } catch (e) {
        // this means it is not a directory
      }
    }
  }
  return false;
}

function isTsFile (fileName: string): boolean {
  return fileName.includes('.ts');
}

function isErrorCodeFile (fileName: string): boolean {
  return fileName === 'ErrorCode.ts';
}

(async () => {

  let errorCodeFileContent =
`/**
 * Error codes used ONLY by this version of the protocol.
 */
export default {
`;

  const errorCodeNames = [];
  for (var code in ErrorCode) {
    if (isNaN(Number(code))) {
      errorCodeNames.push(code);
    }
  }

  errorCodeNames.sort();

  for (let i = 0; i < errorCodeNames.length; i++) {
    // only add to the error code file if usage is found in code
    if (isErrorCodeReferencedInDicrectory(errorCodeNames[i], latestVersionDirectory)) {
      const camelCaseErrorMessage = errorCodeNames[i].replace(/\.?([A-Z])/g, function (_x, y) { return '_' + y.toLowerCase(); }).replace(/^_/, '');
      if (i === errorCodeNames.length - 1) {
        errorCodeFileContent += `  ${errorCodeNames[i]}: '${camelCaseErrorMessage}'\n`;
      } else {
        errorCodeFileContent += `  ${errorCodeNames[i]}: '${camelCaseErrorMessage}',\n`;
      }
    } else {
      console.info(`${errorCodeNames[i]} is removed from ErrorCode because it is not used.`);
    };
  }

  errorCodeFileContent +=
`};
`;

  fs.writeFileSync(`${saveLocation}`, errorCodeFileContent);
})();
