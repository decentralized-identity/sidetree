# Contribution Guidelines

The following document covers the contribution guidelines for the artifacts in this repository.

## Commit message format

A well formed commit message communicates context about a change. A diff will tell you what changed. A well cared for
commit log is a beautiful and useful thing.

What may be a hassle at first soon becomes habit, and eventually a source of pride and productivity for all
involved. From reviews to maintenance it's a powerful tool. Understanding why something happened months or years ago
becomes not only possible but efficient.

We rely on consistent commit messages as we use
[conventional-changelog](https://github.com/conventional-changelog/conventional-changelog) which automatically generates
the changelog diff based on the commit messages

We enforce well formed commit messages with pre-commit hooks using [husky](https://github.com/typicode/husky).

The following guidelines are based on the angular
team's [contribution guide](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#-commit-message-guidelines).
Checkout [commitizen](https://www.npmjs.com/package/commitizen) and [commitlint.io](https://commitlint.io/) for
assistance in how it works.

In general the commit message **MUST** be of the following form to validate

```
type(scope): subject
```

Where the `type` must be one of the following, indicating the type of change being made by the commit.

* **build**: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
* **ci**: Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
* **docs**: Documentation only changes
* **feat**: A new feature
* **fix**: A bug fix
* **perf**: A code change that improves performance
* **refactor**: A code change that neither fixes a bug nor adds a feature
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
* **test**: Adding missing tests or correcting existing tests

The `scope` defines what is being changed, in this repository the scope **MUST** be one of the following

* **spec**: Changes being made to the Sidetree specification
* **ref-imp**: Changes being made to the Sidetree reference implementation

The `subject` should be a short descriptive statement describing the nature of the change made by the commit.

Full examples

```
feat(ref-imp): add fee calculation algorithm
```

or 

```
fix(spec): ambiguity around update operation terminology
```

### Breaking changes

When your commit features a breaking change, the commit body should feature `BREAKING CHANGE: <description of the breaking change>` so that these are noted correctly in the resulting changelog.

### Helper script

A helper scripts of `commit` is included in the `package.json` to aid in making well formed commit messages, when you are ready to commit changes simply run the following and follow the prompts

```
npm run commit
```