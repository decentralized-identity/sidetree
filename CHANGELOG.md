# [0.12.0](https://github.com/decentralized-identity/sidetree/compare/v0.9.1...v0.12.0) (2020-12-11)


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



# [0.11.0](https://github.com/decentralized-identity/sidetree/compare/v0.9.1...v0.11.0) (2020-09-04)


### Bug Fixes

* **ref-imp:** [#760](https://github.com/decentralized-identity/sidetree/issues/760) - Fixed long-form resolution not verifying delta size ([fc1e8a9](https://github.com/decentralized-identity/sidetree/commit/fc1e8a90e0a5a0a45cead4c99c206e093ada20cc))
* **ref-imp:** added size limit for writer_lock_id field in anchor file ([be481c0](https://github.com/decentralized-identity/sidetree/commit/be481c002c8643d65e7203097338ddc94eca6cd6))
* **ref-imp:** fixed all typos in code ([123d30a](https://github.com/decentralized-identity/sidetree/commit/123d30a1ae42e5c406d1840b3501f37e8b7c79d0))
* **ref-imp:** fixed initialization failure when restart bitcoin proce… ([#845](https://github.com/decentralized-identity/sidetree/issues/845)) ([289ffce](https://github.com/decentralized-identity/sidetree/commit/289ffce52f397fc92cb267ed97e80888b3635d9e))


### Features

* **ref-imp:** [#336](https://github.com/decentralized-identity/sidetree/issues/336) - added published field in method metadata + fixed issue [#833](https://github.com/decentralized-identity/sidetree/issues/833) ([f3f8318](https://github.com/decentralized-identity/sidetree/commit/f3f8318031ef66ccb7ec12428f4aa000683037c9))
* **ref-imp:** [#766](https://github.com/decentralized-identity/sidetree/issues/766) - Implemented hashing of public key as reveal value ([2b529f0](https://github.com/decentralized-identity/sidetree/commit/2b529f0a2d7290d85e3c67d06fb838dcefaf856a))
* **ref-imp:** [#847](https://github.com/decentralized-identity/sidetree/issues/847) - Added new long form DID format support ([b6945a9](https://github.com/decentralized-identity/sidetree/commit/b6945a9286d053e8254b604c8926ce35dc21d47c))
* **ref-imp:** add support for bitcoin regtest network ([447337b](https://github.com/decentralized-identity/sidetree/commit/447337be30e9b3cf7c130d98204daea59d8b96ae))
* **ref-imp:** changed IPFS CAS adaptor to use IPFS HTTP API directly ([a84f079](https://github.com/decentralized-identity/sidetree/commit/a84f079607bad63de2aac8d04acaefecc820fb39))
* update language around commitments ([2071e92](https://github.com/decentralized-identity/sidetree/commit/2071e92c162f8a117932020b21a08c50f38926af))



<a name="0.10.0"></a>
# [0.10.0](https://github.com/decentralized-identity/sidetree/compare/v0.9.1...v0.10.0) (2020-07-28)


### Features

* update language around commitments ([2071e92](https://github.com/decentralized-identity/sidetree/commit/2071e92))



# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.