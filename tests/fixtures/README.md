Test Vectors have moved to [test-vectors](../vectors).

When implementing features that impact test vectors you will need to regenerate them.

Toggle the `OVERWRITE_TEST_VECTORS` boolean on [test-vectors](../vectors/generate.spec.ts).

Once new vectors have been generated, your tests will all start failing.

Then you need to update the other fixtures, by toggling `OVERWRITE_FIXTURES`.

For example see [Resolver.spec.ts](../core/Resolver.spec.ts).

When running tests with `OVERWRITE_FIXTURES` set to true, the `received` output will be written to disk.

The next time you run the test, it should pass, because `received` will match `expected`.

Be sure to review the JSON that is being written to disk, its possible for test to pass and the JSON on disk to be incorrect.
