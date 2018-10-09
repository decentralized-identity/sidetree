import { Response, ResponseStatus } from './Response';

function handleFetchRequest (_hash: string): Response {
  return {
    status: ResponseStatus.ServerError,
    body: { error: 'Not implemented' }
  };
}

export { handleFetchRequest };
