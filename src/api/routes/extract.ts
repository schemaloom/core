import { Hono } from "hono";
import llm from "../../extraction/providers/gemini.js";
import EventListSchema from "../../schemas/eventSchema.js";
import promptTemplate from "../../extraction/extractor.js";

const extract = new Hono();

extract.post("/", async (c) => {
	const body = await c.req.parseBody();
	const content = await body.file.text()


	// Now we call the extractor
	const structured_llm = llm.withStructuredOutput(EventListSchema)
	const prompt = await promptTemplate.invoke({text: content})
	let eventlist = await structured_llm.invoke(prompt)

	return c.json(eventlist)
});

export default extract;
