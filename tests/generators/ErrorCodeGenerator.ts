import * as fs from 'fs';
import * as path from 'path';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode'

const saveLocation = path.resolve(__dirname, '../../../lib/core/versions/latest/ErrorCode.ts');
// fs.mkdirSync(saveLocation, { recursive: true });

(async () => {
  // Auto-generates error code based on the enum value and overwrites the original error code file.

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
    const camelCaseErrorMessage = errorCodeNames[i].replace(/\.?([A-Z])/g, function (_x,y){return "_" + y.toLowerCase()}).replace(/^_/, "");
    if (i === errorCodeNames.length - 1) {
      errorCodeFileContent += `  ${errorCodeNames[i]}: '${camelCaseErrorMessage}'\n`
    } else {
      errorCodeFileContent += `  ${errorCodeNames[i]}: '${camelCaseErrorMessage}',\n`
    }
  }

  errorCodeFileContent +=
`};

`;

  fs.writeFileSync(`${saveLocation}`, errorCodeFileContent);
})();
