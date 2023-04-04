# Sidetree

This repository contains both the blockchain-agnostic Sidetree specification.
A reference implementation [can be found here](https://github.com/decentralized-identity/sidetree-reference-impl).

## Specification

See the [latest spec](https://identity.foundation/sidetree/spec/) for the full Sidetree specification.

See the [API spec](https://identity.foundation/sidetree/api/) for the full API specification to interact with a Sidetree node.

### Specification Editing/Contributions:

1. Clone the repo.
2. Create a topic branch for your spec contributions.
3. run `npm install`
4. run `npm run spec:edit`
5. If you see errors like `UnhandledPromiseRejectionWarning: Error: ENOENT: no such file or directory, open './www/spec/index.html'`... create the missing directories and files and try again (they will be overwritten).
6. Type `npx serve .` in the root directory and open `http://localhost:5000/www/spec`.
7. Modify files in the `spec/markdown/` directory to make changes, refresh to see changes.
8. Do not commit build assets.
9. Try and make blocks of text small so that changes can be suggested easily on specific lines.
10. When you are happy with your changes, commit to your topic branch and open a Pull Request on GitHub and reviewers will be alerted to review for a potential merge.
11. Make sure to tag people continuously to ensure your PR is reviewed in a timely manner.
12. PRs that sit open without comments / reviews, will be closed at the editors discretion.
