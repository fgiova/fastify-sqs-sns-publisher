import {test} from "tap";
import "../helpers/localtest";
import fp from "fastify-plugin";
import Fastify from "fastify";
import publisherPlugin, {PublisherMessage} from "../../src";
import { setTimeout } from "timers/promises";
import {SQS} from "@aws-sdk/client-sqs";
import {sqsPurge} from "../helpers/sqsMessage";

test("plugin definition", async t => {
	const app = Fastify();
	t.teardown(async () => {
		await app.close();
	});
	app.register(publisherPlugin, {
		sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`
	});
	app.register(fp(async (app, opts) => {
	}, {
		dependencies: ["fastify-sqs-sns-publisher"]
	}));
	await t.resolves(app.ready() as any);
});

test("sqs publisher", async t => {
	const sqs = new SQS({
		endpoint: `${process.env.LOCALSTACK_ENDPOINT}`
	});
	await t.test("SQS publish message", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		await app.messageToSQS({message:"test-sqs"}, "test-queue");
		const messages = await sqs.receiveMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`
		});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sqs\"}");
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});
	});
	await t.test("SQS publish message as text", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		await app.messageToSQS(JSON.stringify({message:"test-sqs"}), "test-queue");
		const messages = await sqs.receiveMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`
		});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sqs\"}");
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});
	});
	await t.test("SQS publish message w attributes", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		const publisherMessage = new PublisherMessage({message: "test-sqs"}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
		});
		await app.messageToSQS(publisherMessage, "test-queue");
		const messages = await sqs.receiveMessage({
			MessageAttributeNames: ["All"],
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`
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
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});
	});
	await t.test("SQS publish message w attributes wrong data", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		const publisherMessage = new PublisherMessage({message:"test-sqs"}, {
			"test-attribute-array": [1, 2],
		} as any);
		try {
			await app.messageToSQS(publisherMessage, "test-queue");
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
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		await app.delayedMessageToSQS({message:"test-sqs", date: Date.now()}, "test-queue", 1);
		const messages = await sqs.receiveMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			WaitTimeSeconds: 10
		});
		const message = messages.Messages[0];
		const body = JSON.parse(message.Body);
		t.equal(body.message, "test-sqs");
		t.ok(Date.now()-body.date >= 1000);
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});
	});
	await t.test("SQS publish delayed message as text", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		await app.delayedMessageToSQS(JSON.stringify({message:"test-sqs", date: Date.now()}), "test-queue", 1);
		const messages = await sqs.receiveMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			WaitTimeSeconds: 10
		});
		const message = messages.Messages[0];
		const body = JSON.parse(message.Body);
		t.equal(body.message, "test-sqs");
		t.ok(Date.now()-body.date >= 1000);
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});
	});
	await t.test("SQS publish delayed message w attributes", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		const publisherMessage = new PublisherMessage({message:"test-sqs", date: Date.now()}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
		});
		await app.delayedMessageToSQS(publisherMessage, "test-queue", 1);
		const messages = await sqs.receiveMessage({
			MessageAttributeNames: ["All"],
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
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
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});
	});
	await t.test("SQS publish messages", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
			await sqsPurge(`${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`);
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		const messages: any[] = [];
		for(let i = 0 ; i < 11; i++) {
			messages.push({message:"test-sqs-batch"});
		}
		await app.messagesBatchToSQS(messages, "test-queue");
		const queueAttributes = await sqs.getQueueAttributes({
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
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		const messages: any[] = [];
		for(let i = 0 ; i < 11; i++) {
			messages.push(JSON.stringify({message:"test-sqs-batch"}));
		}
		await app.messagesBatchToSQS(messages, "test-queue");
		const queueAttributes = await sqs.getQueueAttributes({
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
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
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
		await app.messagesBatchToSQS(messages, "test-queue");
		const queueAttributes = await sqs.getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			AttributeNames: [
				"All"
			],
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessages, "11");
		const messagesRead = await sqs.receiveMessage({
			MessageAttributeNames: ["All"],
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
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
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
		});
		await app.ready();
		const messages: any[] = [];
		for(let i = 0 ; i < 11; i++) {
			messages.push(JSON.stringify({message:"test-sqs-batch", date: Date.now()}));
		}
		await app.delayedBatchToSQS(messages, "test-queue", 1);
		const queueAttributes = await sqs.getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			AttributeNames: [
				"All"
			]
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessagesDelayed, "11");
		const messagesFromQueue = await sqs.receiveMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
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
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}`
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
		await app.delayedBatchToSQS(messages, "test-queue", 1);
		const queueAttributes = await sqs.getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			AttributeNames: [
				"All"
			],
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessagesDelayed, "11");
		const messagesRead = await sqs.receiveMessage({
			MessageAttributeNames: ["All"],
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
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

test("sns publisher", async t => {
	const sqs = new SQS({
		endpoint: `${process.env.LOCALSTACK_ENDPOINT}`
	});
	await t.test("SNS publish message", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/`
		});
		await app.ready();
		await app.messageToSNS({message:"test-sns"}, "arn:aws:sns:eu-central-1:000000000000:test-topic");
		await setTimeout(1000);
		const messages = await sqs.receiveMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`
		});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sns\"}");
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});
	});
	await t.test("SNS publish message as text", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/`
		});
		await app.ready();
		await app.messageToSNS(JSON.stringify({message:"test-sns"}), "arn:aws:sns:eu-central-1:000000000000:test-topic");
		await setTimeout(1000);
		const messages = await sqs.receiveMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`
		});
		const message = messages.Messages[0];
		t.same(message.Body, "{\"message\":\"test-sns\"}");
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});
	});
	await t.test("SNS publish message w attributes", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/`
		});
		await app.ready();
		const publisherMessage = new PublisherMessage({message:"test-sns"}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
			"test-attribute-array": ["test", "test2"],
		});
		await app.messageToSNS(publisherMessage, "arn:aws:sns:eu-central-1:000000000000:test-topic");
		await setTimeout(1000);
		const messages = await sqs.receiveMessage({
			MessageAttributeNames: ["All"],
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`
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
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});
	});
	await t.test("SNS publish message w attributes wrong data", async t => {
		const app = Fastify();
		t.teardown(async () => {
			await app.close();
		});
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/`
		});
		await app.ready();
		const publisherMessage = new PublisherMessage({message:"test-sns"}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
			"test-attribute-array": ["test", "test2"],
			"test-attribute-wrong": {test: "test"}
		} as any);
		try {
			await app.messageToSNS(publisherMessage, "arn:aws:sns:eu-central-1:000000000000:test-topic");
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
		app.register(publisherPlugin, {
			sqsEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/`,
			awsApiEndpoint: `${process.env.LOCALSTACK_ENDPOINT}/`
		});
		await app.ready();
		const publisherMessage = new PublisherMessage({message:"test-sns"}, {
			"test-attribute-number": 1,
			"test-attribute-string": "test",
			"test-attribute-array": ["test", "test2"],
		});
		await app.messageToSNS(publisherMessage, "arn:aws:sns:eu-central-1:000000000000:test-topic");
		await setTimeout(1000);
		const publisherMessage2 = new PublisherMessage({message:"test-sns-2"}, {
			"test": "test",
		});
		await app.messageToSNS(publisherMessage2, "arn:aws:sns:eu-central-1:000000000000:test-topic");
		await setTimeout(1000);
		const queueAttributes = await sqs.getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			AttributeNames: [
				"All"
			],
		});
		t.equal(queueAttributes.Attributes.ApproximateNumberOfMessages, "2");
		const messages = await sqs.receiveMessage({
			MessageAttributeNames: ["All"],
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`
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
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue`,
			ReceiptHandle: message.ReceiptHandle
		});

		const queueAttributes2 = await sqs.getQueueAttributes({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue-filtered`,
			AttributeNames: [
				"All"
			],
		});
		t.equal(queueAttributes2.Attributes.ApproximateNumberOfMessages, "1");

		const messages2 = await sqs.receiveMessage({
			MessageAttributeNames: ["All"],
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue-filtered`
		});
		const message2 = messages2.Messages[0];
		t.same(message2.Body, "{\"message\":\"test-sns-2\"}");
		t.has(message2.MessageAttributes.test, {
			"DataType": "String",
			"StringValue": "test"
		});
		await sqs.deleteMessage({
			QueueUrl: `${process.env.LOCALSTACK_ENDPOINT}/000000000000/test-queue-filtered`,
			ReceiptHandle: message2.ReceiptHandle
		});
	});
});

