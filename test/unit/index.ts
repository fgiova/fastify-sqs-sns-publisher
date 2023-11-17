import {test} from "tap";
// @ts-ignore
import "../helpers/localtest";
import fp from "fastify-plugin";
import Fastify from "fastify";
import publisherPlugin  from "../../src";
// @ts-ignore
import {sqsPurge} from "../helpers/sqsMessage";

test("plugin definition", async t => {
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
	app.register(fp(async (app, opts) => {
	}, {
		dependencies: ["fastify-sqs-sns-publisher"]
	}));
	await t.resolves(app.ready() as any);
});

