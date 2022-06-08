## [1.0.6](https://github.com/decentralized-identity/sidetree/compare/v1.0.4...v1.0.6) (2022-06-08)


### Bug Fixes

* **ref-imp:** [#1015](https://github.com/decentralized-identity/sidetree/issues/1015) - Set deactivated metadata property ([151be6f](https://github.com/decentralized-identity/sidetree/commit/151be6f44435c139906bf68bd02b60c89e734e6a))
* **ref-imp:** [#1169](https://github.com/decentralized-identity/sidetree/issues/1169) - fixed bug on commit-reveal chain leading to infinite loop in resolution ([156df5f](https://github.com/decentralized-identity/sidetree/commit/156df5fef61e452848f69bf33d77a98eda2f09c9))
* **ref-imp:** added support for IPFS v0.11 ([a196c52](https://github.com/decentralized-identity/sidetree/commit/a196c52be703d876e292d01fa8da9c1bab10b751))
* **ref-imp:** allow Bitcoin Core to remember list of wallet to load during startup ([#1164](https://github.com/decentralized-identity/sidetree/issues/1164)) ([23d726e](https://github.com/decentralized-identity/sidetree/commit/23d726eca8654fe1ffea94939a699b6bc007886d))
* **ref-imp:** fix deactivate ([#1149](https://github.com/decentralized-identity/sidetree/issues/1149)) ([6322ef2](https://github.com/decentralized-identity/sidetree/commit/6322ef2397694436f6f34e4ac7434ce6eb375de3))
* **ref-imp:** fixed an integer precision bug in how transaction number is constructed ([c19a1ec](https://github.com/decentralized-identity/sidetree/commit/c19a1ec7eca4a5d9ff24989b1f37a6ac6eff40f7))
* **ref-imp:** fixed casing that prevented filtering out mongo commands in logs ([d0c42d8](https://github.com/decentralized-identity/sidetree/commit/d0c42d80ccf14473f273f430c7bbcbb2910196fb))
* **ref-imp:** fixed run time crashing of Core due to previous mongodb logging commit ([5c0c7f9](https://github.com/decentralized-identity/sidetree/commit/5c0c7f9a6bd04220284eeed5c249ccc8cb87ad01))
* **ref-imp:** fixes controller property to have a value ([83ef023](https://github.com/decentralized-identity/sidetree/commit/83ef02300a400471537f2d2ad87f78a3b266154c))
* **ref-imp:** fixing/removing dependencies with known vulnerabilities ([6099613](https://github.com/decentralized-identity/sidetree/commit/609961361e97546ff9d5139d961244b13df99dad))
* **ref-imp:** integrate custom logger with mongodb ([#1157](https://github.com/decentralized-identity/sidetree/issues/1157)) ([a357828](https://github.com/decentralized-identity/sidetree/commit/a357828e179a5aaa165e87ae32f652b84788cbe2))
* **ref-imp:** port transaction processor fix to v1 folder ([19c9492](https://github.com/decentralized-identity/sidetree/commit/19c949235ecdb7928719610d2fbae4996e74432d))
* **ref-imp:** refactored getWriterValueTimeLock() to handle error better ([6f9b4d5](https://github.com/decentralized-identity/sidetree/commit/6f9b4d5d9947ef5e6a69c668f1c62682e7be368c))
* **ref-imp:** updated bitcoin service to retry on connectivity issues ([2fe9c78](https://github.com/decentralized-identity/sidetree/commit/2fe9c785df61c75ce81347c93fdf52042e7319c1))


### BREAKING CHANGES

* **ref-imp:** The controller is no longer an empty string and instead matches
the document id property (e.g. the did being resolved)



## [1.0.5](https://github.com/decentralized-identity/sidetree/compare/v1.0.4...v1.0.5) (2021-07-26)


### Bug Fixes

* **ref-imp:** fix deactivate ([#1149](https://github.com/decentralized-identity/sidetree/issues/1149)) ([6322ef2](https://github.com/decentralized-identity/sidetree/commit/6322ef2397694436f6f34e4ac7434ce6eb375de3))
* **ref-imp:** port transaction processor fix to v1 folder ([0b8c1ff](https://github.com/decentralized-identity/sidetree/commit/0b8c1fffdbb00a4b8660cca03d80249b870c840a))



## [1.0.4](https://github.com/decentralized-identity/sidetree/compare/v1.0.3...v1.0.4) (2021-07-16)


### Bug Fixes

* **ref-imp:** automatically create bitcoin wallet ([#1138](https://github.com/decentralized-identity/sidetree/issues/1138)) ([674d753](https://github.com/decentralized-identity/sidetree/commit/674d753ad30da2ef348b8e9b69eaa66bfc9e4024))
* **ref-imp:** fixed bug where transaction is skipped if save for retry fails ([ce23a61](https://github.com/decentralized-identity/sidetree/commit/ce23a61eec2907135dd9d991bef77b12843eff87))
* **ref-imp:** fixed retry logic always fails due to missing fee and lock info ([3e16be4](https://github.com/decentralized-identity/sidetree/commit/3e16be4f265f306f43009e26d1b0a5bc5743859c))
* **ref-imp:** listunspent needs to be a wallet RPC call ([ef4ea65](https://github.com/decentralized-identity/sidetree/commit/ef4ea65955ae4b93fd365ff96f438ddb5043fb8a))
* **ref-imp:** make bitcoin load wallet and specify wallet ([#1140](https://github.com/decentralized-identity/sidetree/issues/1140)) ([81e74d1](https://github.com/decentralized-identity/sidetree/commit/81e74d15adaae86433e9d1c7f8bd648edb7b7806))


### Features

* **ref-imp:** make core read blockchain time from db ([#1137](https://github.com/decentralized-identity/sidetree/issues/1137)) ([bd5445c](https://github.com/decentralized-identity/sidetree/commit/bd5445c74ed0679c150ad03daf0b67be5c381d87)), closes [#1139](https://github.com/decentralized-identity/sidetree/issues/1139)
* **ref-imp:** only allow DB upgrade on observer node ([63b9301](https://github.com/decentralized-identity/sidetree/commit/63b930126476709d5a45315ff00ce3b6a78617e3))



## [1.0.3](https://github.com/decentralized-identity/sidetree/compare/v1.0.1...v1.0.3) (2021-05-28)


### Bug Fixes

* **ref-imp:** add suffix check when parsing operation ([#1117](https://github.com/decentralized-identity/sidetree/issues/1117)) ([6a6ef47](https://github.com/decentralized-identity/sidetree/commit/6a6ef478ada962de9171315e10b4dd2a8deaecfd))
* **ref-imp:** added missing bitcoin event export ([9ab3ce6](https://github.com/decentralized-identity/sidetree/commit/9ab3ce66b2b6d201bf2c32d36845b9d4ae75e2c0))
* **ref-imp:** better transactions API behavior when bitcoin service is in forked state ([c3940ad](https://github.com/decentralized-identity/sidetree/commit/c3940ad3d8ba2ede365adfb95dd75272c303554d))
* **ref-imp:** error thrown in blockchain time refresh can crash core ([6c20245](https://github.com/decentralized-identity/sidetree/commit/6c202452a177493ac37dfd58a9fb5371c88f1bf9))
* **ref-imp:** fix missing transaction when bitcoin rpc call fails ([#1116](https://github.com/decentralized-identity/sidetree/issues/1116)) ([3732ac3](https://github.com/decentralized-identity/sidetree/commit/3732ac3976c03e9b07e0313551e7b49c359d3b31))
* **ref-imp:** fixed DB upgrade failng due to null service state ([54b4288](https://github.com/decentralized-identity/sidetree/commit/54b4288a1f2cea1df22f89f803a88f34ecf9f76c))
* **ref-imp:** fixed typo in long-form resolution log ([9fb410c](https://github.com/decentralized-identity/sidetree/commit/9fb410c5f699cf1b3faa6204ac412712ed7f91cf))
* **ref-imp:** improved error message for incorrect DID prefix ([51b8cf8](https://github.com/decentralized-identity/sidetree/commit/51b8cf8a406fe9123841afb7d4f113e36e145e1e))
* **ref-imp:** made Core event code consistent with bitcoin service ([6abd2a1](https://github.com/decentralized-identity/sidetree/commit/6abd2a10a72e69ceb5d0569c87f6075fdc1cfa26))
* **ref-imp:** updated bitcoin listunspent RPC call to include unconfirmed transactions ([1a028d1](https://github.com/decentralized-identity/sidetree/commit/1a028d178fd03968f3a04a65816ad38c6c3b2386))
* **ref-imp:** updated mongodb lib version in attempt to fix rare DB infinite awaits ([9fc1f1c](https://github.com/decentralized-identity/sidetree/commit/9fc1f1ca2d54e68f555e7968a2e6be6af8d6832a))
* **spec:** revert vector insertion ([#1061](https://github.com/decentralized-identity/sidetree/issues/1061)) ([12e1bff](https://github.com/decentralized-identity/sidetree/commit/12e1bff89322c84a16f94133ae0be42fa5387249))


### Features

* **ref-imp:** added bitcoin lock monitor events ([009202d](https://github.com/decentralized-identity/sidetree/commit/009202dcb39eb9b28f1525de259fb3b68dcb5f56))
* **ref-imp:** added error code metadata for batch writer loop failure event ([9ee807f](https://github.com/decentralized-identity/sidetree/commit/9ee807f47cf8e8a8d90e25946526af34295727b2))
* **ref-imp:** added feature to monitor writer max batch size + minor fixes ([5d0a14e](https://github.com/decentralized-identity/sidetree/commit/5d0a14eaa8e160b9030acdbd2a5d3fd080dd3bbf))
* **ref-imp:** added support for MongoDB 4.0 based cloud storage services ([b987678](https://github.com/decentralized-identity/sidetree/commit/b98767847ad8cb2be1cf44c065ebf5033e96eb09))
* **ref-imp:** added timeout for fetaching operations of a DID ([b840682](https://github.com/decentralized-identity/sidetree/commit/b84068285f3e8a0267885a2aae3617affe86f9ed))
* **ref-imp:** emitted a couple of events in bitcoin processor ([189cfcd](https://github.com/decentralized-identity/sidetree/commit/189cfcd15ed03b4a8e1c0d9d13f88e2b7eda862c))
* **ref-imp:** introduced database versioning ([378a964](https://github.com/decentralized-identity/sidetree/commit/378a964b4769d0c0c5108e758c30140290bb6afb))



## [1.0.1](https://github.com/decentralized-identity/sidetree/compare/v1.0.0...v1.0.1) (2021-02-03)


### Bug Fixes

* **ref-imp:** fixed bug where overwriting a particial operation to MongoDB silently fails ([966d45f](https://github.com/decentralized-identity/sidetree/commit/966d45f9a0946b8fcec18298163d2c4bf5fa7cf6))
* **ref-imp:** renamed put method IOperationStore to insertOrReplace ([32d7d18](https://github.com/decentralized-identity/sidetree/commit/32d7d181230761d5ad0e9f9da6cb78ff9ccab056))



# [1.0.0](https://github.com/decentralized-identity/sidetree/compare/v0.12.1...v1.0.0) (2021-01-21)


### Bug Fixes

* **ref-imp:** [#997](https://github.com/decentralized-identity/sidetree/issues/997) - increment updateCommitment if failed to apply an update patch ([9258b84](https://github.com/decentralized-identity/sidetree/commit/9258b844d07446b7c1e1c3a4cabf396f242d90bc))
* **spec:** fixed incorrect documentation on `method` DID Document metadata property ([#1003](https://github.com/decentralized-identity/sidetree/issues/1003)) ([17133cc](https://github.com/decentralized-identity/sidetree/commit/17133ccb91c33acc9a2b77949dd5869ac5414e1a))


### Features

* **ref-imp:** [#440](https://github.com/decentralized-identity/sidetree/issues/440) - added custom logger support ([c2d086a](https://github.com/decentralized-identity/sidetree/commit/c2d086aebc1598fe0ba92a9bcc02de2b4f79e1c1))
* **ref-imp:** [#989](https://github.com/decentralized-identity/sidetree/issues/989) - added event emitter support ([099e52a](https://github.com/decentralized-identity/sidetree/commit/099e52a71d9ba8f777c4a111dd99f814829d995e))
* **ref-imp:** added a lib to fetch operation queue size for monitoring ([3956109](https://github.com/decentralized-identity/sidetree/commit/39561094161acf75a703bab2fd7ddcd8d8b71750))
* **ref-imp:** added a number of events to the core service + fix to Observer ([4a3575e](https://github.com/decentralized-identity/sidetree/commit/4a3575e89513ab1b6838e96991f1fe55218467cd))



## [0.12.1](https://github.com/decentralized-identity/sidetree/compare/v0.9.1...v0.12.1) (2020-12-14)


### Bug Fixes

* **ref-imp:** [#631](https://github.com/decentralized-identity/sidetree/issues/631) - Allowed valid core index file without provisional index file URI ([0c94173](https://github.com/decentralized-identity/sidetree/commit/0c941739696ed448a63da1711eee9d0a596d6b82))
* **ref-imp:** [#760](https://github.com/decentralized-identity/sidetree/issues/760) - Fixed long-form resolution not verifying delta size ([fc1e8a9](https://github.com/decentralized-identity/sidetree/commit/fc1e8a90e0a5a0a45cead4c99c206e093ada20cc))
* **ref-imp:** [#817](https://github.com/decentralized-identity/sidetree/issues/817) - should be HTTP 410 for deactivated DID ([3f9a896](https://github.com/decentralized-identity/sidetree/commit/3f9a8961b176b0c0fd2c658cd188a30e969e5c01))
* **ref-imp:** [#820](https://github.com/decentralized-identity/sidetree/issues/820) - Deactivate not working ([97b31ac](https://github.com/decentralized-identity/sidetree/commit/97b31acd9187260a209c11917c03782e195e016a))
* **ref-imp:** [#873](https://github.com/decentralized-identity/sidetree/issues/873) - Allowed only canonically encoded DID suffix to pass hash check ([a1fbdbf](https://github.com/decentralized-identity/sidetree/commit/a1fbdbf3bdab71bcf67cb8682b4ed4cb033e66b9))
* **ref-imp:** [#897](https://github.com/decentralized-identity/sidetree/issues/897) - changed remove-public-keys to use ids ([#904](https://github.com/decentralized-identity/sidetree/issues/904)) ([98fec6f](https://github.com/decentralized-identity/sidetree/commit/98fec6fd1a83f607bdfe79184ea51015b91ad463))
* **ref-imp:** [#898](https://github.com/decentralized-identity/sidetree/issues/898) - Used a URI library for URI validation ([bdeeb5f](https://github.com/decentralized-identity/sidetree/commit/bdeeb5fcfb27aeef532ae7d3518424478c5ff50d))
* **ref-imp:** [#927](https://github.com/decentralized-identity/sidetree/issues/927) - Relaxed CAS URI validation ([b5a13be](https://github.com/decentralized-identity/sidetree/commit/b5a13beab14cd5b0fc84c6c879975e180bcecbb8))
* **ref-imp:** [#960](https://github.com/decentralized-identity/sidetree/issues/960) - fixed incorrect IPFS pin API endpoint ([ece6d7f](https://github.com/decentralized-identity/sidetree/commit/ece6d7fec6b132f0a6523c9d6f6245e67cb5927e))
* **ref-imp:** [#969](https://github.com/decentralized-identity/sidetree/issues/969) - allow missing provisionalIndexFileUri in some cases ([46f846b](https://github.com/decentralized-identity/sidetree/commit/46f846b51c65996ffadd52b635da2929d1331b05))
* **ref-imp:** added size limit for writer_lock_id field in anchor file ([be481c0](https://github.com/decentralized-identity/sidetree/commit/be481c002c8643d65e7203097338ddc94eca6cd6))
* **ref-imp:** fix duplicate service id ([#951](https://github.com/decentralized-identity/sidetree/issues/951)) ([dae2caf](https://github.com/decentralized-identity/sidetree/commit/dae2caf9d456181f5244715f6f5f4a25a07dea65))
* **ref-imp:** fix normalized fee calculation ([#944](https://github.com/decentralized-identity/sidetree/issues/944)) ([9f3b565](https://github.com/decentralized-identity/sidetree/commit/9f3b565f176fbb6930a79b006e33e9901d171797))
* **ref-imp:** fix null delta throwing unexpected error ([#957](https://github.com/decentralized-identity/sidetree/issues/957)) ([26bc857](https://github.com/decentralized-identity/sidetree/commit/26bc8571007d38307bddece92fd91adcf3cdf1cd))
* **ref-imp:** fixed all typos in code ([123d30a](https://github.com/decentralized-identity/sidetree/commit/123d30a1ae42e5c406d1840b3501f37e8b7c79d0))
* **ref-imp:** fixed initialization failure when restart bitcoin proce… ([#845](https://github.com/decentralized-identity/sidetree/issues/845)) ([289ffce](https://github.com/decentralized-identity/sidetree/commit/289ffce52f397fc92cb267ed97e80888b3635d9e))
* **ref-imp:** Issue [#895](https://github.com/decentralized-identity/sidetree/issues/895) - Implemented conformance to an API/style guide ([314ec0b](https://github.com/decentralized-identity/sidetree/commit/314ec0b50d68e93ec65d7522a8ad7defe1a42bf5))
* **ref-imp:** make bitcoin logic make less calls to db ([#906](https://github.com/decentralized-identity/sidetree/issues/906)) ([175b5f7](https://github.com/decentralized-identity/sidetree/commit/175b5f7f682f6ce8d77e70d8e9169ec7088c0ab3))
* **ref-imp:** make encoder error readable ([#959](https://github.com/decentralized-identity/sidetree/issues/959)) ([bc8e8d4](https://github.com/decentralized-identity/sidetree/commit/bc8e8d4c10e694c84861eb5c4c6d33f10be33bf6))
* **ref-imp:** make recover and create to always advance commitment [#744](https://github.com/decentralized-identity/sidetree/issues/744) ([4dfdc67](https://github.com/decentralized-identity/sidetree/commit/4dfdc673d4e41d4a3a45428f3960a2a87f1e592f))
* **ref-imp:** update cids version ([#984](https://github.com/decentralized-identity/sidetree/issues/984)) ([02f8531](https://github.com/decentralized-identity/sidetree/commit/02f8531c7d2e613602b9a97e09d45ada0e4e53d8))
* **ref-imp:** updated default protocol parameters ([a65d2ee](https://github.com/decentralized-identity/sidetree/commit/a65d2ee9c2d4d85b7cfa7a64f9727e2b92bb60f5))
* **spec:** fix broken anchors commitment-value-generation ([#887](https://github.com/decentralized-identity/sidetree/issues/887)) ([e64bcd3](https://github.com/decentralized-identity/sidetree/commit/e64bcd3b7389350a9a8d50d8c8e6146a38ffd7d0))
* **spec:** fixed one occurrence of `suffix_data` to `suffixData` ([4a33a98](https://github.com/decentralized-identity/sidetree/commit/4a33a9894b66db056cbeb5bbe5080073a6f29ff8))
* **spec:** mention JSON Compact Serialization in spec ([90f85b8](https://github.com/decentralized-identity/sidetree/commit/90f85b897e117e3d2a22589fc4a9153ec8b86983))
* **spec:** update patches to reflected agreed upon changes ([#896](https://github.com/decentralized-identity/sidetree/issues/896)) ([1224e0c](https://github.com/decentralized-identity/sidetree/commit/1224e0c5346da0484fb63fd0d6d0a6f244ef13f6))


### Features

* **ref-imp:** [#319](https://github.com/decentralized-identity/sidetree/issues/319) - Added ability to turn on or off Observer and Batch Writer ([13e0563](https://github.com/decentralized-identity/sidetree/commit/13e0563c9ec16c89181816f850596c41e19a04b9))
* **ref-imp:** [#336](https://github.com/decentralized-identity/sidetree/issues/336) - added published field in method metadata + fixed issue [#833](https://github.com/decentralized-identity/sidetree/issues/833) ([f3f8318](https://github.com/decentralized-identity/sidetree/commit/f3f8318031ef66ccb7ec12428f4aa000683037c9))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - added support to validate reveal value as a hash ([c866b74](https://github.com/decentralized-identity/sidetree/commit/c866b74ca548485c22381fdd7489d6383f1af189))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - changed mapFileUri to provisionalIndexFileUri ([542421e](https://github.com/decentralized-identity/sidetree/commit/542421e2f3a0cd145c439ce52c3239baade7e1f1))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - Implemented hashing of public key as reveal value ([2b529f0](https://github.com/decentralized-identity/sidetree/commit/2b529f0a2d7290d85e3c67d06fb838dcefaf856a))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - introduced create references to align with rest of operation references ([b733694](https://github.com/decentralized-identity/sidetree/commit/b733694a35264291ac5e49efffc59a73ac484f16))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - renamed all references to anchor and map files ([fabf550](https://github.com/decentralized-identity/sidetree/commit/fabf550898b89b1fa5b753a941566830860efa01))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - SIP 1 - Added downloading of proof files ([82ee13b](https://github.com/decentralized-identity/sidetree/commit/82ee13ba618b9f968a785b1b187daf549c0cb9a0))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - SIP 1 - Added writing of Proof files ([63735c8](https://github.com/decentralized-identity/sidetree/commit/63735c829586f0857b659d7505ea849aa3449f05))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - SIP 1 - Moved provisionalProofFileUri into map file ([de15a6d](https://github.com/decentralized-identity/sidetree/commit/de15a6d2d0aa0fdcf53c0766f671912329f4cffc))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - Updated anchor (core index) file schema ([8a62900](https://github.com/decentralized-identity/sidetree/commit/8a62900422f62f9a9b5bed654f3aa91c0f67e1e0))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - updated API, resolver, batch writer to support revealValue in requests ([c0a3332](https://github.com/decentralized-identity/sidetree/commit/c0a333247c10c6079bfbed68fab325580350d1e0))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - updated error handling for file downloading and validation ([9300ac5](https://github.com/decentralized-identity/sidetree/commit/9300ac5aa82fc06b0c040115b938f0f9ea81bf58))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - Updated map (provisional index) file schema ([e5bbfdd](https://github.com/decentralized-identity/sidetree/commit/e5bbfdd18c38daa0f965250fd1a7cfdf76abcd57))
* **ref-imp:** [#781](https://github.com/decentralized-identity/sidetree/issues/781) - make jcs long form do size check on delta ([#866](https://github.com/decentralized-identity/sidetree/issues/866)) ([20cfc61](https://github.com/decentralized-identity/sidetree/commit/20cfc61572ec99aeff82864fe4ad4c5dae42d56e))
* **ref-imp:** [#781](https://github.com/decentralized-identity/sidetree/issues/781) - make long form use jcs SIP2 ([#864](https://github.com/decentralized-identity/sidetree/issues/864)) ([5808eaf](https://github.com/decentralized-identity/sidetree/commit/5808eafb861614e172dccf168421e3ef10bb1d5a))
* **ref-imp:** [#783](https://github.com/decentralized-identity/sidetree/issues/783) - Fixed a crash on init + a bug that trends normalized fee to zero + minor fixes ([2ec03ca](https://github.com/decentralized-identity/sidetree/commit/2ec03ca58e9c8de70c58486c730b6eed2214bc41))
* **ref-imp:** [#783](https://github.com/decentralized-identity/sidetree/issues/783) - New normalized fee algorithm + versioning protocol parameters ([a84366a](https://github.com/decentralized-identity/sidetree/commit/a84366a4039e02129d8625c4a2219e996d36c994))
* **ref-imp:** [#847](https://github.com/decentralized-identity/sidetree/issues/847) - Added new long form DID format support ([b6945a9](https://github.com/decentralized-identity/sidetree/commit/b6945a9286d053e8254b604c8926ce35dc21d47c))
* **ref-imp:** [#890](https://github.com/decentralized-identity/sidetree/issues/890) - ability to turn of value time lock updates ([6ea1ea4](https://github.com/decentralized-identity/sidetree/commit/6ea1ea4b3b6fb2022c929d61d179a7c69ac3150e))
* **ref-imp:** [#919](https://github.com/decentralized-identity/sidetree/issues/919) - Added feature to disable observer in bitcoin service ([34d348b](https://github.com/decentralized-identity/sidetree/commit/34d348bcf7ee435ffaab5044160774a616b1e536))
* **ref-imp:** [#978](https://github.com/decentralized-identity/sidetree/issues/978) - Added DB upgrade support to core service ([b02b0c1](https://github.com/decentralized-identity/sidetree/commit/b02b0c175d5d809e2caed3ff6d9834d3da9bc2c7))
* **ref-imp:** add support for bitcoin regtest network ([447337b](https://github.com/decentralized-identity/sidetree/commit/447337be30e9b3cf7c130d98204daea59d8b96ae))
* **ref-imp:** changed IPFS CAS adaptor to use IPFS HTTP API directly ([a84f079](https://github.com/decentralized-identity/sidetree/commit/a84f079607bad63de2aac8d04acaefecc820fb39))
* **ref-imp:** issue [#868](https://github.com/decentralized-identity/sidetree/issues/868) - Allowed service endpoint to be an object + added more data validations ([#869](https://github.com/decentralized-identity/sidetree/issues/869)) ([3eaf265](https://github.com/decentralized-identity/sidetree/commit/3eaf265577adda393e82fb6bf07e65f6ab3ffcdd))
* **ref-imp:** reduce db calls when calculating normalized fee ([#939](https://github.com/decentralized-identity/sidetree/issues/939)) ([b6959f2](https://github.com/decentralized-identity/sidetree/commit/b6959f2188c0544e98d76aea82bd350f15196211))
* update language around commitments ([2071e92](https://github.com/decentralized-identity/sidetree/commit/2071e92c162f8a117932020b21a08c50f38926af))



<a name="0.10.0"></a>
# [0.10.0](https://github.com/decentralized-identity/sidetree/compare/v0.9.1...v0.10.0) (2020-07-28)


### Features

* update language around commitments ([2071e92](https://github.com/decentralized-identity/sidetree/commit/2071e92))



# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.