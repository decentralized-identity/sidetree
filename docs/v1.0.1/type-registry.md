# Sidetree DID Type Registry

The following table is a registry of DID type strings that can be used in Sidetree implementations that support the type declaration property noted in the [Create Operation Suffix Data Object](https://identity.foundation/sidetree/spec/#create-suffix-data-object).

The registry is predicated on mapping well-known schema-defined objects to terse byte strings. All types are of non-human entities, objects, and things. To propose additions to the list, file an Issue with this repo and add the `did-type` and `feature` tags.


| Type Name               | Schema                                    | Type String |
|-------------------------|-------------------------------------------|:------------|
| Organization            | https://schema.org/Organization           | 0001        |
| Government Organization | https://schema.org/GovernmentOrganization | 0002        |
| Corporation             | https://schema.org/Corporation            | 0003        |
| Local Business          | https://schema.org/LocalBusiness          | 0004        |
| Software Package        | https://schema.org/SoftwareSourceCode     | 0005        |
| Web App                 | https://schema.org/WebApplication         | 0006        |
