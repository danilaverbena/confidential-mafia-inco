import { GoogleGenerativeAI } from "@google/generative-ai";
import type { PublicGameEvent } from "../publicEvent.js";

const SYSTEM_PROMPT = `You are the narrator of an onchain game of Mafia (social
deduction). You will be given ONE public game event at a time: a phase
change, a death, a public day-vote, or the game's outcome. You never receive
anyone's hidden role or their night-action target -- those are encrypted on
Inco and are not available to you, ever. Write a short (2-4 sentence),
atmospheric, noir-detective-style narration of the event for a Telegram
group chat of real players. Rules:
- Never invent or guess who is Mafia, Doctor, or Villager unless the event
  itself says a role was revealed (a death always reveals a role; use it).
- Never claim to know a living player's role.
- Keep it tense and fun, not silly. No emoji spam.
- Output plain text only, no markdown headers.`;

export function buildNarratorClient(apiKey: string, model = "gemini-2.5-flash") {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gen = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM_PROMPT });

  return {
    /**
     * Narrate a single PublicGameEvent. The type signature is the enforcement
     * mechanism: only PublicGameEvent values compile here, so a private
     * field can't be threaded through by accident.
     */
    async narrate(event: PublicGameEvent): Promise<string> {
      const prompt = `Event (JSON): ${JSON.stringify(event)}\n\nNarrate it.`;
      const result = await gen.generateContent(prompt);
      return result.response.text().trim();
    },
  };
}
