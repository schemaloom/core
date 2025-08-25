import { Hono } from "hono";
import llm from "../../extraction/providers/gemini.js";
import EventListSchema from "../../schemas/eventSchema.js";
import promptTemplate from "../../extraction/extractor.js";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const extract = new Hono();
const contentSplitter = new RecursiveCharacterTextSplitter({
	chunkSize: 1000,
	chunkOverlap: 0
});


extract.post("/", async (c) => {

	const body = await c.req.parseBody();
	const content = await body.file.text()

	// Split the content
	
	const splitContent = await contentSplitter.splitText(content)


	// Now we call the extractor
	const structured_llm = llm.withStructuredOutput(EventListSchema)


	let responseArr = [];
	for (let i = 0; i < splitContent.length; i++) {
		console.log(`Processing chunk ${i + 1}/${splitContent.length}: ${splitContent[i]}`)
		const prompt = await promptTemplate.invoke({text: splitContent[i]})
		let eventList = await structured_llm.invoke(prompt)
		responseArr.push(eventList)
	}


	// Combine results 
	return c.json(responseArr.flat())
});

export default extract;
