import {test} from "tap";
// @ts-ignore
import "../helpers/localtest";
import Fastify from "fastify";
import publisherPlugin, {PublisherMessage} from "../../src";
import { setTimeout } from "timers/promises";
// @ts-ignore
import {sqsPurge} from "../helpers/sqsMessage";
import {MiniSQSClient} from "@fgiova/mini-sqs-client";
import {SQS} from "@aws-sdk/client-sqs";

const queueARN = "arn:aws:sqs:eu-central-1:000000000000:test-queue-topic";
const topicARN = "arn:aws:sns:eu-central-1:000000000000:test-topic";

test("sns publisher", async t => {
	const awsSQS = new SQS({
		endpoint: `${process.env.LOCALSTACK_ENDPOINT}`
	});
	const sqs = new MiniSQSClient("eu-central-1", process.env.LOCALSTACK_ENDPOINT);
	t.teardown(async () => {
		await sqs.destroy();
	});
	await t.test("SNS publish message", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		await app.register(publisherPlugin,  {
			sqs: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			},
			sns: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			}
		});
		await app.ready();
		await app.messageToSNS({message:"test-sns"}, topicARN);
		await setTimeout(1000);
		const messages = await sqs.receiveMessage(queueARN, {});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sns\"}");
		await sqs.deleteMessage(queueARN, message.ReceiptHandle);
	});
	await t.test("SNS publish message as text", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		await app.register(publisherPlugin,  {
			sqs: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			},
			sns: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			}
		});
		await app.ready();
		await app.messageToSNS(JSON.stringify({message:"test-sns"}), topicARN);
		await setTimeout(1000);
		const messages = await sqs.receiveMessage(queueARN, {});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sns\"}");
		await sqs.deleteMessage(queueARN, message.ReceiptHandle);
	});
	await t.test("SNS publish message w attributes", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin,  {
			sqs: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			},
			sns: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			}
		});
		await app.ready();
		const publisherMessage = new PublisherMessage({message:"test-sns"}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
			"test-attribute-array": ["test", "test2"],
		});
		await app.messageToSNS(publisherMessage, topicARN);
		await setTimeout(1000);
		const messages = await sqs.receiveMessage(queueARN,{
			MessageAttributeNames: ["All"],
		});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sns\"}");
		t.has(message.MessageAttributes["test-attribute-number"], {
			"DataType": "Number",
			"StringValue": "1"
		});
		t.has(message.MessageAttributes["test-attribute-string"], {
			"DataType": "String",
			"StringValue": "test"
		});
		t.has(message.MessageAttributes["test-attribute-array"], {
			"DataType": "String.Array",
			"StringValue": JSON.stringify(["test", "test2"])
		});
		await sqs.deleteMessage(queueARN, message.ReceiptHandle);
	});
	await t.test("SNS publish message w attributes wrong data", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin,  {
			sqs: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			},
			sns: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			}
		});
		await app.ready();
		const publisherMessage = new PublisherMessage({message:"test-sns"}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
			"test-attribute-array": ["test", "test2"],
			"test-attribute-wrong": {test: "test"}
		} as any);
		try {
			await app.messageToSNS(publisherMessage, topicARN);
		}
		catch (e) {
			t.same(e.message, "Invalid data type");
		}
	});

	await t.test("SNS publish message w attributes and filters", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		await app.register(publisherPlugin,  {
			sqs: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			},
			sns: {
				region: "eu-central-1",
				endpoint: process.env.LOCALSTACK_ENDPOINT
			}
		});
		await app.ready();
		const publisherMessage = new PublisherMessage({message:"test-sns"}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
			"test-attribute-array": ["test", "test2"],
		});
		await app.messageToSNS(publisherMessage, topicARN);
		await setTimeout(1000);
		const publisherMessage2 = new PublisherMessage({message:"test-sns-2"}, {
			"test": "test",
		});
		await app.messageToSNS(publisherMessage2, topicARN);
		await setTimeout(1000);
		const queueAttributes = await awsSQS.getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue-topic`,
			AttributeNames: [
				"All"
			],
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessages, "2");
		const messages = await sqs.receiveMessage(queueARN,{
			MessageAttributeNames: ["All"],
		});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sns\"}");
		t.has(message.MessageAttributes["test-attribute-number"], {
			"DataType": "Number",
			"StringValue": "1"
		});
		t.has(message.MessageAttributes["test-attribute-string"], {
			"DataType": "String",
			"StringValue": "test"
		});
		t.has(message.MessageAttributes["test-attribute-array"], {
			"DataType": "String.Array",
			"StringValue": JSON.stringify(["test", "test2"])
		});

		const queueAttributes2 = await awsSQS.getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue-topic-filtered`,
			AttributeNames: [
				"All"
			],
		});
		t.equal(queueAttributes2.Attributes.ApproximateNumberOfMessages, "1");

		const messages2 = await sqs.receiveMessage("arn:aws:sqs:eu-central-1:000000000000:test-queue-topic-filtered",{
			MessageAttributeNames: ["All"]
		});
		const message2 = messages2.Messages[0];
		t.same(message2.Body, "{\"message\":\"test-sns-2\"}");
		t.has(message2.MessageAttributes.test, {
			"DataType": "String",
			"StringValue": "test"
		});
	});
});

