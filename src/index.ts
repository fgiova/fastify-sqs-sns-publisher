import fp from "fastify-plugin";
import type {Pool} from "undici";
import {Signer, SignerOptions} from "@fgiova/aws-signature";
import {MiniSQSClient, SendMessage} from "@fgiova/mini-sqs-client";
import {MiniSNSClient, PublishMessage} from "@fgiova/mini-sns-client";
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

	/* c8 ignore start */
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
	/* c8 ignore stop */

	public getAttributesSNS(): PublishMessage["MessageAttributes"] | undefined {
		const attributes: PublishMessage["MessageAttributes"] = {};
		if(!this.attributes) return undefined;
		for (const property in this.attributes) {
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

	/* c8 ignore start */
	private getSQSValue(value: unknown): string {
		if (value.constructor === String) {
			return value;
		}
		else if (!isNaN(Number(value))) {
			return value.toString();
		}
		throw new Error("Invalid data type");
	}
	/* c8 ignore stop */

	public getAttributesSQS(): SendMessage["MessageAttributes"] | undefined {
		const attributes: SendMessage["MessageAttributes"] = {};
		if(!this.attributes) return undefined;
		for (const property in this.attributes) {
			if (this.attributes.hasOwnProperty(property)) {
				const value = this.attributes[property];
				attributes[property] = {
					DataType: this.getSQSDataType(value) as any,
					StringValue: this.getSQSValue(value)
				};
			}
		}
		return attributes;
	}
}

declare module "fastify" {
	export interface FastifyInstance {
		sqs: MiniSQSClient,
		sns: MiniSNSClient
		messageToSQS(message: string | Record<string, any>, queueArn: string): sendMessageType;
		delayedMessageToSQS(message: string | Record<string, any>, queueArn: string, delaySeconds: number): sendMessageType;
		messagesBatchToSQS(message: (string | Record<string, any>)[], queueArn: string): sendMessagesType;
		delayedBatchToSQS(message: (string | Record<string, any>)[], queueArn: string, delaySeconds: number): sendMessagesType;
		messageToSNS(message: string | Record<string, any>, topicArn: string): sendTopicMessageType;
		messagesBatchToSNS(message: (string | Record<string, any>)[], topicArn: string): sendTopicMessagesType;
	}
}

type sendMessageType = ReturnType<typeof publishSQSMessage>;
type sendMessagesType = ReturnType<typeof publishSQSBatch>;
type sendTopicMessageType = ReturnType<typeof publishSNSMessage>;
type sendTopicMessagesType = ReturnType<typeof publishSNSBatch>;
type PublisherMessageType = string | Record<string, any> | PublisherMessage;


const SQSMessageData = (message: PublisherMessage): Pick<SendMessage,"MessageBody" | "MessageAttributes" | "DelaySeconds"> => {
	const MessageBody = message.getMessage();
	const DelaySeconds = message.getDelaySeconds();
	const MessageAttributes = message.getAttributesSQS();
	return {
		MessageBody,
		MessageAttributes,
		DelaySeconds
	};
};

const SNSMessageData = (message: PublisherMessage): Pick<PublishMessage,"Message" | "MessageAttributes"> => {
	const Message = message.getMessage();
	const MessageAttributes = message.getAttributesSNS();
	return {
		Message,
		MessageAttributes
	};
};

const publishSQSMessage = (message: PublisherMessage, queueArn: string, sqs: MiniSQSClient) => {
	const MessageData = SQSMessageData(message);
	return sqs.sendMessage(queueArn, MessageData);
};

const publishSNSMessage = (message: PublisherMessage, topic: string, sns: MiniSNSClient) => {
	const MessageData = SNSMessageData(message);
	return sns.publishMessage({
		...MessageData,
		TopicArn: topic
	});
};

const publishSQSBatch = async (messages: PublisherMessage[], queueArn: string, sqs: MiniSQSClient) => {
	const entries = messages.map(message => {
		const MessageData = SQSMessageData(message);
		return {
			Id: randomUUID(),
			...MessageData
		};
	});

	return sqs.sendMessageBatch(queueArn, entries);
};

/* c8 ignore start */
const publishSNSBatch = async (messages: PublisherMessage[], topicArn: string, sns: MiniSNSClient) => {
	const entries = messages.map(message => {
		const MessageData = SNSMessageData(message);
		return {
			Id: randomUUID(),
			...MessageData
		};
	});

	return sns.publishMessageBatch({
		TopicArn: topicArn,
		PublishBatchRequestEntries: entries
	})
};
/* c8 ignore stop */

const publisherSqsSns = (fastify: FastifyInstance, options: {
	sns: {
		region: string,
		endpoint?: string
	},
	sqs: {
		region: string,
		endpoint?: string
	},
	undiciOptions?: Pool.Options,
	signer?: Signer | SignerOptions,
	destroySigner?: boolean
}, done: any) => {
	/* c8 ignore next */
	const signer = options.signer instanceof Signer ? options.signer : new Signer({...options.signer || {}});
	const sqs = new MiniSQSClient(options.sqs.region, options.sqs.endpoint, options.undiciOptions, signer);
	const sns = new MiniSNSClient(options.sns.region, options.sns.endpoint, options.undiciOptions, signer);
	fastify.decorate("sqs", sqs);
	fastify.decorate("sns", sns);
	fastify.decorate("messageToSQS", (message: PublisherMessageType, queueArn: string) => {
		const publisherMessage = message instanceof PublisherMessage ? message : new PublisherMessage(message);
		return publishSQSMessage(publisherMessage, queueArn, sqs);
	});
	fastify.decorate("delayedMessageToSQS", (message: PublisherMessageType, queueArn: string, delaySeconds: number) => {
		const publisherMessage = message instanceof PublisherMessage ? message : new PublisherMessage(message);
		publisherMessage.setDelaySeconds(delaySeconds);
		return publishSQSMessage(publisherMessage, queueArn, sqs);
	});
	fastify.decorate("messagesBatchToSQS", (messages: PublisherMessageType[], queueArn: string) => {
		const publisherMessages = messages.map(message => message instanceof PublisherMessage ? message : new PublisherMessage(message));
		return publishSQSBatch(publisherMessages, queueArn, sqs);
	});
	fastify.decorate("delayedBatchToSQS", (messages: PublisherMessageType[], queueArn: string, delaySeconds: number) => {
		const publisherMessages = messages.map(message => {
			const publisherMessage = message instanceof PublisherMessage ? message : new PublisherMessage(message);
			publisherMessage.setDelaySeconds(delaySeconds);
			return publisherMessage;
		});
		return publishSQSBatch(publisherMessages, queueArn, sqs);
	});
	fastify.decorate("messageToSNS", (message: string | Record<string, any>, topic: string) => {
		const publisherMessage = message instanceof PublisherMessage ? message : new PublisherMessage(message);
		return publishSNSMessage(publisherMessage, topic, sns);
	});
	/* c8 ignore start */
	fastify.decorate("messagesBatchToSNS", (messages: PublisherMessageType[], topic: string) => {
		const publisherMessages = messages.map(message => message instanceof PublisherMessage ? message : new PublisherMessage(message));
		return publishSNSBatch(publisherMessages, topic, sns);
	});
	/* c8 ignore stop */
	fastify.addHook("onClose", async () => {
		await Promise.all(
			[
				sqs.destroy(false),
				sns.destroy(false)
			]
		);
		/* c8 ignore next 6 */
		try {
			return options.destroySigner || options.destroySigner === undefined ? await signer.destroy() : null;
		}
		catch (error) {
			return null;
		}
	});
	done();
};

export default fp(publisherSqsSns, {
	name: "fastify-sqs-sns-publisher",
	fastify: ">=4.x"
});