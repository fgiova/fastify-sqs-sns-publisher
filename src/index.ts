	import fp from "fastify-plugin";
import {SendMessageBatchCommand, SendMessageCommand, SendMessageRequest, SQSClient as SQS} from "@aws-sdk/client-sqs";
import {SNSClient as SNS, PublishBatchCommand, PublishCommand, PublishInput} from "@aws-sdk/client-sns";
import {FastifyInstance} from "fastify";
import {randomUUID} from "crypto";


export class PublisherMessage {
	private readonly message: string;
	private readonly attributes: Record<string, any>;
	private delaySeconds: number | undefined;
	constructor(message: string | Record<string, any>, attributes?: Record<string, string | number | string[]>, delaySeconds?: number) {
		this.message = message.constructor === String ? message : JSON.stringify(message);
		this.attributes = attributes;
		this.delaySeconds = delaySeconds;
	}

	public getMessage(): string {
		return this.message;
	}

	public getDelaySeconds(): number | undefined {
		return this.delaySeconds;
	}

	public setDelaySeconds(_seconds: number | undefined) {
		this.delaySeconds = _seconds;
	}

	private getSNSDataType(value: unknown): string {
		if (value.constructor === String) {
			return "String";
		}
		else if (value.constructor === Array) {
			return "String.Array";
		}
		else if (!isNaN(Number(value))) {
			return "Number";
		}

		throw new Error("Invalid data type");
	}

	/* istanbul ignore next */
	private getSNSValue(value: unknown): string {
		if (value.constructor === String) {
			return value;
		}
		else if (value.constructor === Array) {
			return JSON.stringify(value);
		}
		else if (!isNaN(Number(value))) {
			return value.toString();
		}
		throw new Error("Invalid data type");
	}

	public getAttributesSNS(): PublishInput["MessageAttributes"] | undefined {
		const attributes: PublishInput["MessageAttributes"] = {};
		if(!this.attributes) return undefined;
		for (const property in this.attributes) {
			/* istanbul ignore else */
			if (this.attributes.hasOwnProperty(property)) {
				const value = this.attributes[property];
				attributes[property] = {
					DataType: this.getSNSDataType(value),
					StringValue: this.getSNSValue(value)
				};
			}
		}
		return attributes;
	}

	private getSQSDataType(value: unknown): string {
		if (value.constructor === String) {
			return "String";
		}
		else if (!isNaN(Number(value))) {
			return "Number";
		}

		throw new Error("Invalid data type");
	}

	/* istanbul ignore next */
	private getSQSValue(value: unknown): string {
		if (value.constructor === String) {
			return value;
		}
		else if (!isNaN(Number(value))) {
			return value.toString();
		}
		/* istanbul ignore next */
		throw new Error("Invalid data type");
	}

	public getAttributesSQS(): SendMessageRequest["MessageAttributes"] | undefined {
		const attributes: SendMessageRequest["MessageAttributes"] = {};
		if(!this.attributes) return undefined;
		for (const property in this.attributes) {
			/* istanbul ignore else */
			if (this.attributes.hasOwnProperty(property)) {
				const value = this.attributes[property];
				attributes[property] = {
					DataType: this.getSQSDataType(value),
					StringValue: this.getSQSValue(value)
				};
			}
		}
		return attributes;
	}
}

declare module "fastify" {
	export interface FastifyInstance {
		sqs: SQS,
		sns: SNS,
		messageToSQS(message: string | Record<string, any>, queueName: string): sendMessageType;
		delayedMessageToSQS(message: string | Record<string, any>, queueName: string, delaySeconds: number): sendMessageType;
		messagesBatchToSQS(message: (string | Record<string, any>)[], queueName: string): sendMessagesType;
		delayedBatchToSQS(message: (string | Record<string, any>)[], queueName: string, delaySeconds: number): sendMessagesType;
		messageToSNS(message: string | Record<string, any>, topic: string): sendTopicMessageType;
		messagesBatchToSNS(message: (string | Record<string, any>)[], topic: string): sendTopicMessagesType;
	}
}

type sendMessageType = ReturnType<typeof publishSQSMessage>;
type sendMessagesType = ReturnType<typeof publishSQSBatch>;
type sendTopicMessageType = ReturnType<typeof publishSNSMessage>;
type sendTopicMessagesType = ReturnType<typeof publishSNSBatch>;
type PublisherMessageType = string | Record<string, any> | PublisherMessage;

const SplitArray = (messages: any[], maxItems = 10 ) => {
	return messages.reduce((resultArray, item, index) => {
		const chunkIndex = Math.floor(index/maxItems);

		if(!resultArray[chunkIndex]) {
			resultArray[chunkIndex] = []; // start a new chunk
		}

		resultArray[chunkIndex].push(item);

		return resultArray;
	}, []);
};

const SQSMessageData = (message: PublisherMessage): Pick<SendMessageRequest,"MessageBody" | "MessageAttributes" | "DelaySeconds"> => {
	const MessageBody = message.getMessage();
	const DelaySeconds = message.getDelaySeconds();
	const MessageAttributes = message.getAttributesSQS();
	return {
		MessageBody,
		MessageAttributes,
		DelaySeconds
	};
};

const SNSMessageData = (message: PublisherMessage): Pick<PublishInput,"Message" | "MessageAttributes"> => {
	const Message = message.getMessage();
	const MessageAttributes = message.getAttributesSNS();
	return {
		Message,
		MessageAttributes
	};
};

const publishSQSMessage = (message: PublisherMessage, queueName: string, sqs: SQS, endpoint: string) => {
	const MessageData = SQSMessageData(message);
	const messageCommand = new SendMessageCommand({
		...MessageData,
		QueueUrl: `${endpoint}/${queueName}`,
	});
	return sqs.send(messageCommand);
};

const publishSNSMessage = (message: PublisherMessage, topic: string, sns: SNS) => {
	const MessageData = SNSMessageData(message);
	const publishCommand = new PublishCommand({
		...MessageData,
		TopicArn: topic
	});
	return sns.send(publishCommand);
};

const publishSQSBatch = async (messages: PublisherMessage[], queueName: string, sqs: SQS, endpoint: string) => {
	const entries = messages.map(message => {
		const MessageData = SQSMessageData(message);
		return {
			Id: randomUUID(),
			...MessageData
		};
	});

	const splittedArray = SplitArray(entries);
	const sqsLoop = [];

	for (const messagesSplitted of splittedArray) {
		sqsLoop.push(sqs.send(new SendMessageBatchCommand({
			Entries: messagesSplitted,
			QueueUrl: `${endpoint}/${queueName}`,
		})));
	}

	return Promise.all(sqsLoop);
};

/* istanbul ignore next */
const publishSNSBatch = async (messages: PublisherMessage[], topic: string, sns: SNS) => {
	const entries = messages.map(message => {
		const MessageData = SNSMessageData(message);
		return {
			Id: randomUUID(),
			...MessageData
		};
	});

	const splittedArray = SplitArray(entries);
	const snsLoop = [];

	for (const messagesSplitted of splittedArray) {
		snsLoop.push(sns.send(new PublishBatchCommand({
			PublishBatchRequestEntries: messagesSplitted,
			TopicArn: topic
		})));
	}

	return Promise.all(snsLoop);
};

const publisherSqsSns = (fastify: FastifyInstance, options: {
	sqsEndpoint: string
	awsApiEndpoint?: string
}, done: any) => {
	const sqs = new SQS({apiVersion: "2012-11-05", endpoint: options.awsApiEndpoint});
	const sns = new SNS({apiVersion: "2010-03-31", endpoint: options.awsApiEndpoint});
	const sqsEndpoint = sqs.config.endpoint?.toString() || "";
	fastify.decorate("sqs", sqs);
	fastify.decorate("sns", sns);
	fastify.decorate("messageToSQS", (message: PublisherMessageType, queueName: string) => {
		const publisherMessage = message instanceof PublisherMessage ? message : new PublisherMessage(message);
		return publishSQSMessage(publisherMessage, queueName, sqs, sqsEndpoint);
	});
	fastify.decorate("delayedMessageToSQS", (message: PublisherMessageType, queueName: string, delaySeconds: number) => {
		const publisherMessage = message instanceof PublisherMessage ? message : new PublisherMessage(message);
		publisherMessage.setDelaySeconds(delaySeconds);
		return publishSQSMessage(publisherMessage, queueName, sqs, sqsEndpoint);
	});
	fastify.decorate("messagesBatchToSQS", (messages: PublisherMessageType[], queueName: string) => {
		const publisherMessages = messages.map(message => message instanceof PublisherMessage ? message : new PublisherMessage(message));
		return publishSQSBatch(publisherMessages, queueName, sqs, sqsEndpoint);
	});
	fastify.decorate("delayedBatchToSQS", (messages: PublisherMessageType[], queueName: string, delaySeconds: number) => {
		const publisherMessages = messages.map(message => {
			const publisherMessage = message instanceof PublisherMessage ? message : new PublisherMessage(message);
			publisherMessage.setDelaySeconds(delaySeconds);
			return publisherMessage;
		});
		return publishSQSBatch(publisherMessages, queueName, sqs, sqsEndpoint);
	});
	fastify.decorate("messageToSNS", (message: string | Record<string, any>, topic: string) => {
		const publisherMessage = message instanceof PublisherMessage ? message : new PublisherMessage(message);
		return publishSNSMessage(publisherMessage, topic, sns);
	});
	/* istanbul ignore next */
	fastify.decorate("messagesBatchToSNS", (messages: PublisherMessageType[], topic: string) => {
		const publisherMessages = messages.map(message => message instanceof PublisherMessage ? message : new PublisherMessage(message));
		return publishSNSBatch(publisherMessages, topic, sns);
	});
	done();
};

export default fp(publisherSqsSns, {
	name: "fastify-sqs-sns-publisher",
	fastify: ">=4.x"
});