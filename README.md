# fastify SQS/SNS publisher plugin
By: Francesco Giovannini <fgiova@fgiova.com>


## Description
This plugin for fastify 4.x allows you to publish messages to AWS SQS queues and SNS topics, using a simple interface.

**Warning**<br>
To use this plugin, you must have correctly configured your [AWS credentials](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).

## Install
```bash
npm i @fgiova/fastify-sqs-sns-publisher
```

### Usage
```js
const fastify = require("fastify")()
const fastifySqsSnsPublisher = require("@fgiova/fastify-sqs-sns-publisher");
app.register(fastifySqsSnsPublisher, {
    sqsEndpoint: "https://sqs.eu-central-1.amazonaws.com",
});

// publish simple message to SQS
app.messageToSQS({message:"test-sqs"}, "test-queue");

// publish batch message to SQS
app.messagesBatchToSQS([{message:"test-sqs-1"}, {message:"test-sqs-2"}], "test-queue");

// publish delayed message to SQS (delay in seconds)
app.messagesBatchToSQS({message:"test-sqs"}, "test-queue", 10);

// publish simple message to SNS
app.messageToSNS({message:"test-sns"}, "arn:aws:sns:eu-central-1:000000000000:test-topic");

// publish batch message to SNS
app.messagesBatchToSNS([{message:"test-sns-1"}, {message:"test-sns-2"}], "arn:aws:sns:eu-central-1:000000000000:test-topic");

```

You can also send messages with attributes using the message creation class PublisherMessage:

```js
const fastify = require("fastify")()
const fastifySqsSnsPublisher = require("@fgiova/fastify-sqs-sns-publisher");
const {PublisherMessage} = require("@fgiova/fastify-sqs-sns-publisher");
app.register(fastifySqsSnsPublisher, {
    sqsEndpoint: "https://sqs.eu-central-1.amazonaws.com",
});

// publish simple message to SQS
app.messageToSQS(new PublisherMessage({message:"test-sqs", attributes: {attr1: "value1"}}), "test-queue");

// publish batch message to SQS
app.messagesBatchToSQS([new PublisherMessage({message:"test-sqs-1", attributes: {attr1: "value1"}}), new PublisherMessage({message:"test-sqs-2", attributes: {attr1: "value1"}})], "test-queue");

// publish delayed message to SQS (delay in seconds)
app.messagesBatchToSQS(new PublisherMessage({message:"test-sqs", attributes: {attr1: "value1"}}), "test-queue", 10);

// publish simple message to SNS
app.messageToSNS(new PublisherMessage({message:"test-sns", attributes: {attr1: "value1"}}), "arn:aws:sns:eu-central-1:000000000000:test-topic");

// publish batch message to SNS
app.messagesBatchToSNS([new PublisherMessage({message:"test-sns-1", attributes: {attr1: "value1"}}), new PublisherMessage({message:"test-sns-2", attributes: {attr1: "value1"}})], "arn:aws:sns:eu-central-1:000000000000:test-topic");

```

The PublisherMessage support the following attributes:

| Attribute type | Message Type | 
|----------------|--------------|
| string         | SQS or SNS   |
| number         | SQS or SNS   |
| string[]       | SNS          |

### Options

| Option          | Type    | Description                                                |
|-----------------|---------|------------------------------------------------------------|
| sqsEndpoint     | string  | The SQS endpoint to use.  (mandatory)                      |
| awsApiEndpoint  | string  | Default endpoint url for AWS API (useful in test sessions) |

## License
Licensed under [MIT](./LICENSE).

### Acknowledgements
This project is kindly sponsored by: isendu Srl [www.isendu.com](https://www.isendu.com)