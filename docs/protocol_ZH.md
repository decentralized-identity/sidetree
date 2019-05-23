# Sidetree 协议规范

本规范文档描述了Sidetree协议，它可以应用于任何分布式记账系统(如比特币)，以创建一个“第2层”PKI网络。协议中的标识符和PKI元数据通过新兴的[_分散标识符_](https://w3c-ccg.github.io/did-spec/)标准表示，协议的实现可以被编码为它们自己独特的DID方法。简而言之，DID方法是用于创建唯一标识符和管理与这些标识符相关联的元数据（_DID文档_）的确定性机制，而不需要集中授权，由唯一的前缀表示，将一个DID方法的标识符与另一个标识符区分开来(例如 `did:foo`, `did:bar` 等等)

## 概述

使用区块链来锚定和跟踪独特的、不可转移的数字实体是一种有用的基础方法，但目前的这种方法受到严重的事务性能限制。Sidetree是一个第2层协议，用于在区块链中锚定和跟踪[_DID文档_](https://w3c-ccg.github.io/did-spec/)。 中心设计理念涉及将多个 _DID文档_ 操作批处理为单个区块链事务。 这使得Sidetree能够继承区块链的不变性和可验证性保证，而不受其交易率的限制。

![Sidetree System Overview](./diagrams/overview-diagram.png)

在架构上，Sidetree网络是由执行Sidetree协议规则的多个逻辑服务器（_Sidetree节点_）组成的网络，如上图所示覆盖了区块链网络。 每个 _Sidetree_ 节点都提供服务端点，以针对 _DID文档_ 执行操作（例如，创建，解析，更新和删除）。区块链共识机制有助于序列化由不同节点发布的Sidetree操作，并为所有Sidetree节点提供所有DID文档状态的一致视图，而无需其自己的共识层。Sidetree协议在单个文件（_批处理文件_）中批量处理多个操作，并将 _批处理文件_ 存储在 _分布式内容可寻址存储（DCAS或CAS）_ 中。 然后将对操作批次的引用锚定在区块链上。 所有批处理操作的实际数据都存储为一个。 任何人都可以在不运行Sidetree节点的情况下运行CAS节点，以提供Sidetree _批处理文件_ 的冗余。

## 术语

| 术语                 | 描述                                                                   |
|-----------------------|--------------------------------------------------------------------------------|
| 锚文件           | 该文件包含一批Sidetree操作的元数据，文件的哈希值作为Sidetree事务写入区块链。 |
| 批处理文件            | 包含所有操作数据一起批处理的文件。                   |
| CAS                   | 同DCAS。                                                                 |
| DCAS                  | Distributed content-addressable storage. 分布式内容可寻址存储。                                      |
| DID文档         | 包含DID元数据的文档，参见[DID规范](https://w3c-ccg.github.io/did-spec/)。|
| DID唯一后缀    | 组成DID唯一性的部分。例如 'did:sidetree:abc'的唯一后缀是'abc' |
| 操作            | 对DID文档的修改。                                                   |
| 操作哈希值       | 一个 _操作请求_ 的编码后内容的哈希值                   |
| 操作请求     | 发送到Sidetree节点以执行操作的JWS格式化请求。    |
| 原始DID文档 | 在创建操作中用于生成DID的DID文档。         |
| 恢复密钥         | 用于执行恢复或删除操作的密钥                   |
| Sidetree节点         | 执行Sidetree协议规则的逻辑服务器。                          |
| 交易          | 区块链交易，表示一批Sidetree操作。         |


## 格式与编码
* JSON用作数据封装格式
* 只要二进制数据或密码一致性需要编码，就会使用Base64URL编码。
* [_Multihas_](https://multiformats.io/multihash/)用于表示哈希值。


## Sidetree协议版本控制与参数
Sidetree协议和参数预计会随着时间的推移而发展。每个版本的协议都将定义新规则和参数值生效的逻辑区块时间。在定义较新的协议版本之前，所有后续事务都将遵循相同的规则和参数值。

以下列出了Sidetree协议的每个版本的参数。

### v1.0
| 参数               | 值           |
|--------------------------|------------------|
| 起始区块 | 500000（比特币） |
| 哈希算法          | SHA256           |
| 最大批处理数量      | 10000            |
| 最大操作大小    | 2 KB             |


## Sidetree操作

[_DID文档_](https://w3c-ccg.github.io/did-spec/#ex-2-minimal-self-managed-did-document
)是包含DID信息的文档，例如DID所有者的公钥和使用的服务端点。 Sidetree协议支持通过Sidetree操作创建，查找和更新DID文档。 使用相应DID文档中指定的密钥对所有操作进行身份验证。

对DID文档的更新被指定为[_JSON补丁_](https://tools.ietf.org/html/rfc6902)，因此在每个操作中仅指定与先前版本的DID文档的差异。

> 注意：创建和恢复操作需要完整的DID文档作为输入，而不是JSON补丁。

### Sidetree操作哈希值

_操作哈希值_ 指的是Sidetree操作请求内容编码后的哈希值。所有操作的确切请求模式都在[Sidetree REST API](#sidetree-rest-api)部分中定义。除了create操作之外，每个操作都必须使用操作哈希值来引用先前的操作，从而形成一个变更历史链。

## Sidetree DID和原始DID文档
Sidetree DID是作为创建操作内容(_原始DID文档_)给出的已编码的DID文档的散列，前缀为Sidetree方法名。给定如何计算 _操作哈希值_，DID值也可以是初始创建操作的哈希值。

由于请求者控制原始DID文档，因此请求者可以在创建操作锚定在区块链之前计算DID。


一个有效的原始DID文档必须是一个有效的通用DID文档，它遵循以下附加的Sidetree协议特定规则:
1. 文档必须没有`id`属性。
1. 文档必须在`publicKey`数组属性中包含至少一个条目。
1. 必须指定`publickey`元素的`id`属性，并将其指定为片段(例如 `#key1`)。
1. 可以具有`service`属性。
1. 服务数组中每个元素的`serviceEndpoint`属性必须:
   1. 包含一个值为`schema.identity.foundation/hub`的`@context`属性。
   1. 包含一个值为`UserServiceEndpoint`的`@type`属性。
   1. `instance`属性的字符串数组中至少包含一个对象。

原始DID文档的示例请参见[DID创建API](#original-did-document-example)章节。

## Sidetree操作批处理
Sidetree协议将多个操作一起批处理，然后在区块链上锚定对该批操作的引用，从而提高了操作吞吐量。

对于每批创建的Sidetree操作，都有两个文件被创建并存储在CAS层中:

1. 批处理文件——包含所有批处理操作的实际更改数据的文件。

2. 锚文件——锚文件的哈希作为Sidetree交易写入到区块链，因此名为“锚”。该文件包含以下内容:
   
    1. 有关Sidetree操作的元数据，包括操作批处理文件的内容可寻址哈希值。

    2. 批处理文件中所有具有操作的DID后缀(区分一个DID和另一个DID的DID字符串的惟一部分)数组。

    3. Merkle树的树根，批处理中所有操作构成此树，以方便以最小开销证明一个操作包含在给定交易中。

### 批处理文件格式
_批处理文件_ 是一个ZIP压缩后的JSON文档，内容格式如下：

```json
{
  "operations": [
    "编码后操作",
    "编码后操作",
    ...
  ]
}
```

### 锚文件格式
_锚文件_ 是一个JSON文档，格式如下：
```json
{
  "batchFileHash": "批处理文件编码后哈希值",
  "didUniqueSuffixes": ["423sd246fg5v5v4c53ero451lh...", "..."],
  "merkleRoot": "根据批处理文件中包含的操作构造的Merkle树根的编码哈希。"
}
```
> 注意：有关 `merkleRoot` 的用途和构造，请参阅 [Sidetree操作回执](#Sidetree-Operation-Receipts) 

### DID操作链
![DID Operation Chaining](./diagrams/operationChaining.png)


## 批规模以及DDoS缓解

考虑到该协议的设计目的是使操作能够以较低的单位成本大规模执行，DDoS对系统是一个真正的威胁。

在没有任何缓解策略的情况下，每个Sidetree批处理可以是任意大的，允许符合协议的恶意节点创建和广播大规模操作批处理，这些批处理不是用于任何其他目的，而是强制其他观察节点根据协议处理其操作。

Sidetree协议定义了以下两种机制来启用扩展，同时防止DDoS攻击：

#### 最大批处理大小
   
   通过定义每批的最大操作数，该策略规避了参与者在系统上锚定任意大的树。 从根本上说，这种缓解策略迫使攻击者应对链上交易单位成本所带来的有机经济压力(译者注：当限制了单笔交易中包含的操作数多少，多出来的操作数将会消耗更多的交易费用)。 基于Sidetree的DID方法的每个实例化可以选择不同的最大批量大小; 默认配置的大小为TBD。（译者注：TBD To Be Discussed 有待讨论）

#### 验证费用

   目标链上的每个Sidetree交易都需要包含确定性的费用，费用应当基于链上交易包含的DID操作的数量。默认配置的协议规则仍在讨论中，但以下内容大致表达了讨论方向：

   1. 区块包含的交易大小决定了操作数量的基线N

   2. 超过N的任何数量的操作都必须证明所支付的费用达到或超过了要求的数额，费用数额按照如下规则决定:

      1. 令块范围R等于节点最新确认的最后一个块，以及它之前的9个块。

      2. 计算中位数费用M的数组，其中每个值都是各个块去掉Sidetree交易后的所有交易费用的中值。

      3. 令目标费用F等于M中所有值的平均值。

      4. 令每操作成本C等于F除以基线量N。

   3. 要测试批次是否符合费用要求，请将批次中的操作数除以交易费用，并确保每次操作所产生的费用超过C.

## Sidetree交易处理
Sidetree交易表示由Sidetree节点处理的一批操作。 每个交易被分配一个单调递增的序号（但不必只加一），_交易序号_ 确定地定义交易的顺序，从而定义操作的顺序。 _交易序号_ 分配给所有Sidetree交易，无论其有效性如何，交易 __必须__ 在其中操作可以被处理之前 __有效__。 Sidetree节点简单地丢弃无效事务。 必须遵循以下规则来确定交易的有效性：

1. 对应的锚文件必须严格遵循协议定义的格式。缺少属性或添加属性的锚文件无效。

1. 对应的批处理文件必须严格遵循协议定义的格式。缺少属性或添加属性的锚文件无效。

1. 操作批数量不能超过协议指定的最大大小。

1. 交易必须符合协议规定的费用证明要求。

1. 在同一交易中的操作都必须遵循以下要求才能被视为 _格式良好的操作_，批处理文件中一个 _格式不正确的操作_ 会导致整个事务无效：

   1. 遵循协议定义的操作格式，它不能缺少或具有其他属性。

   1. 不得超过协议指定的操作大小。

   1. 必须使用协议指定的哈希算法。

> 注意：当交易无法找到对应的 _锚文件_ 与 _批处理文件_ 时，交易被认为 _无效_ 。此类交易属于 _无法解析交易_ ，必须在其锚文件及批处理文件可用时进行重新处理。

## DID删除与恢复
Sidetree协议要求DID所有者指定用于删除或恢复DID的专用加密密钥（称为恢复密钥）。 每个“创建和恢复”操作中至少需要指定一个恢复密钥。 恢复密钥只能通过其他恢复操作进行更改。 删除DID后，无法恢复。

恢复操作常用于在控制设备/密钥丢失或被盗后重新获得控制，是一种编码为特定恢复行为的操作，并调用指定的恢复密钥来对操作签名。 该操作在观察节点上处理，覆盖取代当前DID文档中存在的所有其他密钥类型。

## Sidetree REST API
_Sidetree节点_ 公开一组REST API，可以创建DID、更新和解析DID文档。 本节定义了Sidetree REST API的`v1.0`版本。


### HTTP响应状态码

| HTTP状态码 | 描述                              |
| ---------------- | ---------------------------------------- |
| 200              | 一切顺利                   |
| 401              | 未经身份验证或未经授权的请求。 |
| 400              | 客户端请求错误                     |
| 500              | 服务器错误                           |


### JSON Web签名
发送到Sidetree节点的每个操作请求都 _必须_ 使用 _序列化的JWS JSON_ 方案进行签名。

在构造用于签名的JWS输入（_JWS签名输入_）时，JWS规范指定了以下方案：

`ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))`

由于Sidetree操作中没有受保护的头，因此JWS签名输入将始终以'`.`'字符开头。

注意，仅当Sidetree节点处理锚定在区块链上的操作时才执行签名验证。 在接收和处理操作请求时，不会进行签名验证。 这是因为无法保证或强制签名密钥在更新过程中的有效性，因为签名密钥可能在尚未被Sidetree节点锚定或看到的早期更新中失效。

### DID与DID文档的创建
使用API去创建一个Sidetree DID与其初始状态。

必须提供已编码的原始DID文档作为请求有效内容，有关有效的原始DID文档的要求，请参见[原始DID文档](#Sidetree-DID-and-Original-DID-Document)部分。

#### 请求路径
```http
POST /<api-version>/ HTTP/1.1
```

#### 请求头
| 字段名                  | 值                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### 请求体格式
```json
{
  "header": {
    "operation": "create",
    "kid": "用于签署原始DID文档的密钥的ID。",
    "alg": "ES256K"
  },
  "payload": "编码原始DID文档。",
  "signature": "编码签名。"
}
```

#### 原始DID文档示例
```json
{
  "@context": "https://w3id.org/did/v1",
  "publicKey": [{
    "id": "#key1",
    "type": "Secp256k1VerificationKey2018",
    "publicKeyHex": "02f49802fb3e09c6dd43f19aa41293d1e0dad044b68cf81cf7079499edfd0aa9f1"
  }],
  "service": [{
    "id": "IdentityHub",
    "type": "IdentityHub",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instance": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```

#### 请求示例
```http
POST /v1.0/ HTTP/1.1

{
  "header": {
    "operation": "create",
    "kid": "#key1",
    "alg": "ES256K"
  },
  "payload": "eyJAY29udGV4dCI6Imh0dHBzOi8vdzNpZC5vcmcvZGlkL3YxIiwicHVibGljS2V5IjpbeyJpZCI6IiNrZXkxIiwidHlwZSI6IlNlY3AyNTZrMVZlcmlmaWNhdGlvbktleTIwMTgiLCJwdWJsaWNLZXlIZXgiOiIwMmY0OTgwMmZiM2UwOWM2ZGQ0M2YxOWFhNDEyOTNkMWUwZGFkMDQ0YjY4Y2Y4MWNmNzA3OTQ5OWVkZmQwYWE5ZjEifSx7ImlkIjoiI2tleTIiLCJ0eXBlIjoiUnNhVmVyaWZpY2F0aW9uS2V5MjAxOCIsInB1YmxpY0tleVBlbSI6Ii0tLS0tQkVHSU4gUFVCTElDIEtFWS4yLkVORCBQVUJMSUMgS0VZLS0tLS0ifV0sInNlcnZpY2UiOlt7InR5cGUiOiJJZGVudGl0eUh1YiIsInB1YmxpY0tleSI6IiNrZXkxIiwic2VydmljZUVuZHBvaW50Ijp7IkBjb250ZXh0Ijoic2NoZW1hLmlkZW50aXR5LmZvdW5kYXRpb24vaHViIiwiQHR5cGUiOiJVc2VyU2VydmljZUVuZHBvaW50IiwiaW5zdGFuY2VzIjpbImRpZDpiYXI6NDU2IiwiZGlkOnphejo3ODkiXX19XX0",
  "signature": "mAJp4ZHwY5UMA05OEKvoZreRo0XrYe77s3RLyGKArG85IoBULs4cLDBtdpOToCtSZhPvCC2xOUXMGyGXDmmEHg"
}
```

#### 响应头
| 字段名                  | 值                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### 响应体格式
响应体是创建的DID文档。

#### 响应体示例
```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:sidetree:EiBJz4qd3Lvof3boqBQgzhMDYXWQ_wZs67jGiAhFCiQFjw",
  "publicKey": [{
    "id": "#key1",
    "type": "Secp256k1VerificationKey2018",
    "publicKeyHex": "029a4774d543094deaf342663ae672728e12f03b3b6d9816b0b79995fade0fab23"
  }],
  "service": [{
    "id": "IdentityHub",
    "type": "IdentityHub",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instance": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```


### DID文档解析
此API用于获取最新版的DID文档。
通过URI可以传入两类字符串：

1. DID

   e.g.
   ```did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A```

   如找到最新的DID文档，将返回。

1. 前缀为方法名，编码后的 _原始DID文档_

   e.g.
   ```did:sidetree:ewogICAgICAiQGNvbnRleHQiOiAiaHR0cHM6Ly93M2lkLm9yZy9kaWQvdjEiLAogICAgICAicHVibGljS2V5IjogWwogICAgICAgIHsKICAgICAgICAgICAgImlkIjogIiNrZXkxIiwKICAgICAgICAgICAgInR5cGUiOiAiU2VjcDI1NmsxVmVyaWZpY2F0aW9uS2V5MjAxOCIsCiAgICAgICAgICAgICJwdWJsaWNLZXlIZXgiOiAiMDM0ZWUwZjY3MGZjOTZiYjc1ZThiODljMDY4YTE2NjUwMDdhNDFjOTg1MTNkNmE5MTFiNjEzN2UyZDE2ZjFkMzAwIgogICAgICAgIH0KICAgICAgXQogICAgfQ```

   使用当前支持的哈希算法对已编码的DID文档进行哈希，以获得相应的DID，然后对计算得到的DID执行解析。如果无法找到DID文档，则直接使用所提供的DID文档生成并返回已解析的DID文档，在这种情况下，所提供的DID文档必须经过与create操作中的原始DID文档相同的验证。

#### 请求路径
```http
GET /<api-version>/<did-or-method-name-prefixed-encoded-original-did-document> HTTP/1.1
```

#### 请求头
无.

#### 请求体格式
无.

#### 请求示例 - DID
```http
GET /v1.0/did:sidetree:exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A HTTP/1.1
```

#### 前缀为方法名，编码后的原始DID文档
```http
GET /v1.0/did:sidetree:ewogICAgICAiQGNvbnRleHQiOiAiaHR0cHM6Ly93M2lkLm9yZy9kaWQvdjEiLAogICAgICAicHVibGljS2V5IjogWwogICAgICAgIHsKICAgICAgICAgICAgImlkIjogIiNrZXkxIiwKICAgICAgICAgICAgInR5cGUiOiAiU2VjcDI1NmsxVmVyaWZpY2F0aW9uS2V5MjAxOCIsCiAgICAgICAgICAgICJwdWJsaWNLZXlIZXgiOiAiMDM0ZWUwZjY3MGZjOTZiYjc1ZThiODljMDY4YTE2NjUwMDdhNDFjOTg1MTNkNmE5MTFiNjEzN2UyZDE2ZjFkMzAwIgogICAgICAgIH0KICAgICAgXQogICAgfQ HTTP/1.1
```

#### 响应体格式
响应体为最新的DID文档

#### 响应体示例
```json
{
  "@context": "https://w3id.org/did/v1",
  "id": "did:sidetree:EiBJz4qd3Lvof3boqBQgzhMDYXWQ_wZs67jGiAhFCiQFjw",
  "publicKey": [{
    "id": "#key1",
    "type": "Secp256k1VerificationKey2018",
    "publicKeyHex": "029a4774d543094deaf342663ae672728e12f03b3b6d9816b0b79995fade0fab23"
  }],
  "service": [{
    "id": "IdentityHub",
    "type": "IdentityHub",
    "serviceEndpoint": {
      "@context": "schema.identity.foundation/hub",
      "@type": "UserServiceEndpoint",
      "instance": ["did:bar:456", "did:zaz:789"]
    }
  }]
}
```


### 更新DID文档
此API用于更新DID文档

#### 请求路径
```http
POST /<api-version>/ HTTP/1.1
```

#### 请求头
| 字段名                 | 值                 |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### 请求体格式
```json
{
  "header": {
    "operation": "update",
    "kid": "ID of the key used to sign the update payload.",
    "alg": "ES256K"
  },
  "payload": "Encoded update payload JSON object define by the schema below.",
  "signature": "Encoded signature."
}
```

#### 上传内容格式
```json
{
  "didUniqueSuffix": "DID的唯一后缀",
  "operationNumber": "该数字初始值为1，每次修改会递增。",
  "previousOperationHash": "上一个对DID文档操作的哈希。",
  "patch": "当前DID文档的RFC 6902 JSON补丁",
}
```

#### 上传内容格式示例
```json
{
  "didUniqueSuffix": "QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf",
  "operationNumber": 12,
  "previousOperationHash": "QmbJGU4wNti6vNMGMosXaHbeMHGu9PkAUZtVBb2s2Vyq5d",
  "patch": [{
    "op": "remove",
    "path": "/publicKey/0"
  }]
}
```

#### 请求示例
```http
POST /v1.0/ HTTP/1.1

{
  "header": {
    "operation": "update",
    "kid": "#key1",
    "alg": "ES256K"
  },
  "payload": "eyJkaWQiOiJkaWQ6c2lkZXRyZWU6RWlERkRGVVNnb3hsWm94U2x1LTE3eXpfRm1NQ0l4NGhwU2FyZUNFN0lSWnYwQSIsIm9wZXJhdGlvbk51bWJlciI6MSwicHJldmlvdXNPcGVyYXRpb25IYXNoIjoiRWlERkRGVVNnb3hsWm94U2x1LTE3eXpfRm1NQ0l4NGhwU2FyZUNFN0lSWnYwQSIsInBhdGNoIjpbeyJvcCI6InJlcGxhY2UiLCJwYXRoIjoiL3B1YmxpY0tleS8xIiwidmFsdWUiOnsiaWQiOiIja2V5MiIsInR5cGUiOiJTZWNwMjU2azFWZXJpZmljYXRpb25LZXkyMDE4IiwicHVibGljS2V5SGV4IjoiMDI5YTQ3NzRkNTQzMDk0ZGVhZjM0MjY2M2FlNjcyNzI4ZTEyZjAzYjNiNmQ5ODE2YjBiNzk5OTVmYWRlMGZhYjIzIn19XX0",
  "signature": "nymBtWB1_nwtSdrHsb2uiIa91yTJWN-lqANEcspjp-9kd079jlGWoYIxgvVKJkW-WJkYA5Kryws9G5XIfup5RA"
}
```

#### 响应体
无.


### DID删除
此API用于删除指定DID。

#### 请求路径
```
POST /<api-version>/
```

#### 请求头
| 字段名                 | 值                 |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

#### 请求体格式
```json
{
  "header": {
    "operation": "delete",
    "kid": "用于签署删除内容的密钥的ID。",
    "alg": "ES256K"
  },
  "payload": "内容为编码的JSON对象，之后会有格式定义。",
  "signature": "编码后的签名。"
}
```

#### 删除内容格式
```json
{
  "didUniqueSuffix": "待删除DID的唯一后缀。",
}
```

#### 删除内容示例
```json
{
  "didUniqueSuffix": "QmWd5PH6vyRH5kMdzZRPBnf952dbR4av3Bd7B2wBqMaAcf",
}
```

#### 请求示例
```http
POST /v1.0/ HTTP/1.1
{
  "header": {
    "operation": "delete",
    "kid": "#key1",
    "alg": "ES256K"
  },
  "payload": "3hAPKZnaKcJkR85UvXhiAH7majrfpZGFFVJj8tgAtK9aSrxnrbygDTN2URoQEghPbWtFgZDMNU6RQjiMD1dpbEaoZwKBSVB3oCq1LR2",
  "signature": "nymBtWB1_nwtSdrHsb2uiIa91yTJWN-lqANEcspjp-9kd079jlGWoYIxgvVKJkW-WJkYA5Kryws9G5XIfup5RA"
}
```

#### Response body 响应体
无.

### DID恢复

> TODO: 要添加的API也会影响删除API

## Sidetree操作回执
Sidetree _锚文件_ 还包括使用批处理操作的哈希值构造的Merkle树的根。特别是Sidetree使用一个不平衡Merkle树结构来处理(最常见的)一批不是2次幂个数的操作:形成一系列独特大小的平衡Merkle树，其中操作列表中较低指数的操作形成较大的树木; 然后，最小的平衡子树递归地与下一个大小的平衡子树合并，形成最终的Merkle树。

Merkle根哈希的包含为操作生成一个简洁回执提供了机会，这样就可以用密码证明它是批处理的一部分。 Sidetree使用以下JSON模式来表示收据：

```json
{
  "receipt": [
    {
      "hash": "Merkle树节点哈希。",
      "side": "必须为“left”或“right”，表示此哈希的位置。"
    },
    ...
  ]
}
```

其中，```回执```的第一个条目是Merkle树中同级的操作哈希值；其次是叔节点，然后是更高的叔节点等等。

> 注意：此方案 _不包括_ 根哈希作为收据的最后一项。

> 注意:如果没有发生批处理(即一个操作的树)，收据数组将是空的。

### Sidetree操作批处理示例
下面是Merkle树的构造，其中包含6个操作的数组:

* 2个叶子[4,5]的最小平衡子树I与4个叶子[0,1,2,3]的相邻平衡树J合并，形成最终的Merkle树。

* [0]的回执是[B, H, I]，[5]的回执是[E, J]
```
                          ROOT=H(J+I)
                          /          \
                        /              \
                J=H(G+H)                 \
              /        \                   \
            /            \                   \
      G=H(A+B)             H=H(C+D)          I=H(E+F)
      /      \             /     \           /      \
    /        \           /        \         /        \
  A=H([0])  B=H([1])  C=H([2])  D=H([3])  E=H([4])  F=H([5])
    |         |         |         |         |         |
    |         |         |         |         |         |
[   0    ,    1    ,    2    ,    3    ,    4    ,    5   ]

Where: [1] -> 表示操作数据数组中第一个元素的二进制缓冲区。
        |  -> 表示操作数据与其哈希之间的逻辑关系。
       H() -> 表示返回表示哈希的二进制缓冲区的哈希函数。
       A+B -> 表示两个二进制缓冲区A和B的联接.
```

下面说明了Merkle树的构造，其中包含7个操作的数组：
* 1叶[6]的最小平衡子树G与2叶[4,5]的相邻平衡子树J合并，形成父L，后者又与4叶[0,1, 2,3]的相邻平衡子树K合并，形成最终的Merkle树。

* [0]的回执为[B，I，L]; [4]的回执为[F，G，K]; [6]的回执是[J，K]。
```
                             ROOT=H(K+L)
                          /               \
                        /                  \
                K=H(H+I)                    L=H(J+G)
              /        \                     /       \
            /            \                  /          \
      H=H(A+B)             I=H(C+D)        J=H(E+F)      \
      /      \             /     \         /      \        \
     /        \           /       \       /         \        \
  A=H([0])  B=H([1])  C=H([2])  D=H([3])  E=H([4])  F=H([5])  G=H([6])
    |         |         |         |         |         |         |
    |         |         |         |         |         |         |
[   0    ,    1    ,    2    ,    3    ,    4    ,    5    ,    6   ]
```


## FAQs
* 为什么要引入锚文件的概念？ 为什么不直接将批处理文件哈希锚定在区块链上？

  能够有效地获取有关批处理操作的元数据是理想的，而无需下载整个批处理文件。 这种设计是实现“轻节点”所必需的，它还为Sidetree协议的其他应用开辟了可能性。

* 为什么要将 _交易序号_ 分配给无效的交易？

  在 _无法解析的交易_ 的情况下，如果交易变得可解决，则该交易是否有效是未知的，因此为其分配交易序号，使得如果交易证明有效，则发生的有效交易的交易序号在以后的时间保持不变。 这还使所有Sidetree节点能够使用相同的交易序号引用同一交易。

