import { ChatPromptTemplate } from "@langchain/core/prompts";

// Define a custom prompt to provide instructions and any additional context.
// 1) You can add examples into the prompt template to improve extraction quality
// 2) Introduce additional parameters to take context into account (e.g., include metadata
//    about the document from which the text was extracted.)
const promptTemplate = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an expert extraction algorithm.
Only extract relevant information from the text.
If you do not know the value of an attribute asked to extract,
return null for the attribute's value.`,
  ],
  // Please see the how-to about improving performance with
  // reference examples.
  // ["placeholder", "{examples}"],
  ["human", "{text}"],
]);



export default promptTemplate;


