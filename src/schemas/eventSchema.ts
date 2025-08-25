import { z } from "zod";



// Single event (keep minimal for Gemini)
const EventSchema = z.object({
  name: z.string(),
  date: z.string(), 
  place: z.string()
})

// Array of events - this works with Gemini arrays
const EventListSchema = z.object({
  events: z.array(EventSchema)
})

export default EventListSchema