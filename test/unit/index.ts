import { test } from "tap";
// biome-ignore lint/suspicious/noTsIgnore: is a test file
// @ts-ignore
import "../helpers/localtest";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import publisherPlugin from "../../src";

test("plugin definition", async (t) => {
	const app = Fastify();
	t.teardown(async () => {
		await app.close();
	});
	app.register(publisherPlugin, {
		sqs: {
			region: "eu-central-1",
			endpoint: process.env.LOCALSTACK_ENDPOINT,
		},
		sns: {
			region: "eu-central-1",
			endpoint: process.env.LOCALSTACK_ENDPOINT,
		},
	});
	app.register(
		fp(async (_app, _opts) => {}, {
			dependencies: ["fastify-sqs-sns-publisher"],
		}),
	);
	await t.resolves(app.ready() as unknown as Promise<FastifyInstance>);
});
