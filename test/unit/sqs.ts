import {test} from "tap";
// @ts-ignore
import "../helpers/localtest";
import Fastify from "fastify";
import publisherPlugin, {PublisherMessage} from "../../src";
// @ts-ignore
import {sqsPurge} from "../helpers/sqsMessage";
import {MiniSQSClient} from "@fgiova/mini-sqs-client";
import {SQS} from "@aws-sdk/client-sqs";

const queueARN = "arn:aws:sqs:eu-central-1:000000000000:test-queue";

test("sqs publisher", async t => {
	const sqs = new MiniSQSClient("eu-central-1", process.env.LOCALSTACK_ENDPOINT);
	t.teardown(async () => {
		await sqs.destroy();
	});
	await t.test("SQS publish message", async t => {
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
		await app.messageToSQS({message:"test-sqs"}, queueARN);
		const messages = await sqs.receiveMessage(queueARN, {});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sqs\"}");
		await sqs.deleteMessage(queueARN, message.ReceiptHandle);
	});
	await t.test("SQS publish message as text", async t => {
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
		await app.messageToSQS(JSON.stringify({message:"test-sqs"}), queueARN);
		const messages = await sqs.receiveMessage(queueARN, {});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sqs\"}");
		await sqs.deleteMessage(queueARN, message.ReceiptHandle);
	});
	await t.test("SQS publish message w attributes", async t => {
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
		const publisherMessage = new PublisherMessage({message: "test-sqs"}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
		});
		await app.messageToSQS(publisherMessage, queueARN);
		const messages = await sqs.receiveMessage(queueARN, {
			MessageAttributeNames: ["All"]
		});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sqs\"}");
		t.has(message.MessageAttributes["test-attribute-number"], {
			"DataType": "Number",
			"StringValue": "1"
		});
		t.has(message.MessageAttributes["test-attribute-string"], {
			"DataType": "String",
			"StringValue": "test"
		});

		await sqs.deleteMessage(queueARN, message.ReceiptHandle);
	});
	await t.test("SQS publish message w attributes wrong data", async t => {
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
		const publisherMessage = new PublisherMessage({message:"test-sqs"}, {
			"test-attribute-array": [1, 2],
		} as any);
		try {
			await app.messageToSQS(publisherMessage, queueARN);
		}
		catch (e) {
			t.same(e.message, "Invalid data type");
		}
	});
	await t.test("SQS publish delayed message", async t => {
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
		await app.delayedMessageToSQS({message:"test-sqs", date: Date.now()}, queueARN, 1);
		const messages = await sqs.receiveMessage(queueARN, {
			WaitTimeSeconds: 10
		});
		const message = messages.Messages[0];
		const body = JSON.parse(message.Body);
		t.equal(body.message, "test-sqs");
		t.ok(Date.now()-body.date >= 1000);
		await sqs.deleteMessage(queueARN, message.ReceiptHandle);
	});
	await t.test("SQS publish delayed message as text", async t => {
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
		await app.delayedMessageToSQS(JSON.stringify({message:"test-sqs", date: Date.now()}), queueARN, 1);
		const messages = await sqs.receiveMessage(queueARN,{
			WaitTimeSeconds: 10
		});
		const message = messages.Messages[0];
		const body = JSON.parse(message.Body);
		t.equal(body.message, "test-sqs");
		t.ok(Date.now()-body.date >= 1000);
		await sqs.deleteMessage(queueARN, message.ReceiptHandle);
	});
	await t.test("SQS publish delayed message w attributes", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
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
		const publisherMessage = new PublisherMessage({message:"test-sqs", date: Date.now()}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
		});
		await app.delayedMessageToSQS(publisherMessage, queueARN, 1);
		const messages = await sqs.receiveMessage(queueARN,{
			MessageAttributeNames: ["All"],
			WaitTimeSeconds: 10
		});
		const message = messages.Messages[0];
		const body = JSON.parse(message.Body);
		t.equal(body.message, "test-sqs");
		t.has(message.MessageAttributes["test-attribute-number"], {
			"DataType": "Number",
			"StringValue": "1"
		});
		t.has(message.MessageAttributes["test-attribute-string"], {
			"DataType": "String",
			"StringValue": "test"
		});
		t.ok(Date.now()-body.date >= 1000);
		await sqs.deleteMessage(queueARN, message.ReceiptHandle);
	});
	await t.test("SQS publish messages", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
			await sqsPurge(`${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`);
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
		const messages: any[] = [];
		for(let i = 0 ; i < 11; i++) {
			messages.push({message:"test-sqs-batch"});
		}
		await app.messagesBatchToSQS(messages, queueARN);
		const queueAttributes = await (new SQS({ endpoint: process.env.LOCALSTACK_ENDPOINT})).getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			AttributeNames: [
				"All"
			]
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessages, "11");
	});
	await t.test("SQS publish messages as text", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
			await sqsPurge(`${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`);
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
		const messages: any[] = [];
		for(let i = 0 ; i < 11; i++) {
			messages.push(JSON.stringify({message:"test-sqs-batch"}));
		}
		await app.messagesBatchToSQS(messages, queueARN);
		const queueAttributes = await (new SQS({ endpoint: process.env.LOCALSTACK_ENDPOINT})).getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			AttributeNames: [
				"All"
			]
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessages, "11");
	});
	await t.test("SQS publish messages w attributes", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
			await sqsPurge(`${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`);
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
		const messages: any[] = [];
		for(let i = 0 ; i < 11; i++) {
			const publisherMessage = new PublisherMessage({message:"test-sqs-batch"}, {
				"test-attribute-number": 1,
				"test-attribute-string": "test",
			});
			messages.push(publisherMessage);
		}
		await app.messagesBatchToSQS(messages, queueARN);
		const queueAttributes = await (new SQS({ endpoint: process.env.LOCALSTACK_ENDPOINT})).getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			AttributeNames: [
				"All"
			],
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessages, "11");
		const messagesRead = await sqs.receiveMessage(queueARN, {
			MessageAttributeNames: ["All"],
			WaitTimeSeconds: 10
		});
		const message = messagesRead.Messages[0];
		const body = JSON.parse(message.Body);
		t.equal(body.message, "test-sqs-batch");
		t.has(message.MessageAttributes["test-attribute-number"], {
			"DataType": "Number",
			"StringValue": "1"
		});
		t.has(message.MessageAttributes["test-attribute-string"], {
			"DataType": "String",
			"StringValue": "test"
		});
	});
	await t.test("SQS publish messages delayed", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
			await sqsPurge(`${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`);
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
		const messages: any[] = [];
		for(let i = 0 ; i < 11; i++) {
			messages.push(JSON.stringify({message:"test-sqs-batch", date: Date.now()}));
		}
		await app.delayedBatchToSQS(messages, queueARN, 1);
		const queueAttributes = await (new SQS({ endpoint: process.env.LOCALSTACK_ENDPOINT})).getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			AttributeNames: [
				"All"
			]
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessagesDelayed, "11");
		const messagesFromQueue = await sqs.receiveMessage(queueARN, {
			WaitTimeSeconds: 10
		});
		const message = messagesFromQueue.Messages[0];
		const body = JSON.parse(message.Body);
		t.equal(body.message, "test-sqs-batch");
		t.ok(Date.now()-body.date >= 1000);
	});

	await t.test("SQS publish delayed messages w attributes", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
			await sqsPurge(`${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`);
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
		const messages: any[] = [];
		for(let i = 0 ; i < 11; i++) {
			const publisherMessage = new PublisherMessage({message:"test-sqs-batch", date: Date.now()}, {
				"test-attribute-number": 1,
				"test-attribute-string": "test",
			});
			messages.push(publisherMessage);
		}
		await app.delayedBatchToSQS(messages, queueARN, 1);
		const queueAttributes = await (new SQS({ endpoint: process.env.LOCALSTACK_ENDPOINT})).getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			AttributeNames: [
				"All"
			],
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessagesDelayed, "11");
		const messagesRead = await sqs.receiveMessage(queueARN, {
			MessageAttributeNames: ["All"],
			WaitTimeSeconds: 10
		});
		const message = messagesRead.Messages[0];
		const body = JSON.parse(message.Body);
		t.equal(body.message, "test-sqs-batch");
		t.has(message.MessageAttributes["test-attribute-number"], {
			"DataType": "Number",
			"StringValue": "1"
		});
		t.has(message.MessageAttributes["test-attribute-string"], {
			"DataType": "String",
			"StringValue": "test"
		});
		t.ok(Date.now()-body.date >= 1000);
	});
});

