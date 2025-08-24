import { Hono } from "hono";

const extract = new Hono();

extract.post("/", async (c) => {
	const body = await c.req.parseBody();
	const content = await body.file.text()
	console.log(content)
});

export default extract;
