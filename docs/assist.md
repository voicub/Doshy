# Ask Home Assistant (Assist)

When you type something in the command box that Doshy's own parser does not understand, the box can offer to pass the sentence to Home Assistant's conversation feature, Assist. Nothing is sent unless you tap the button.

## What it does

- Doshy's own commands (lights, scenes and so on) work as before and still wait for Confirm.
- If Doshy answers "I did not understand", an "Ask Home Assistant Assist" button appears under the answer. Pressing Enter never sends it.
- Home Assistant works out the sentence and **carries it out immediately**, with no second confirmation. It can control whatever your Assist settings expose.
- What Doshy refuses on purpose (locks, alarms, garage doors, system settings) is not offered to Assist either.

## How to use it

1. Type a sentence in the command box, for example "turn off everything in the hall".
2. If Doshy cannot handle it, tap **Ask Home Assistant Assist**.
3. The first time, tick "I understand Assist executes immediately, without another confirmation". After that the one-time tick is remembered on this device.
4. Optional: pick a **Conversation agent** in the list (Home Assistant default, or any agent your Home Assistant lists, such as a language-model agent).
5. The answer appears as a short conversation. A follow-up such as "and the kitchen too" continues the same conversation. **Reset conversation** starts over.
6. After the answer, Doshy watches the normal state polls for about 10 seconds and shows a toast "Home Assistant changed: ..." naming the devices that changed. Changed devices on the model pulse. Doshy never claims a change from the spoken answer alone.

Settings (Display panel, "Home Assistant Assist"):

| setting | meaning |
|---|---|
| Ask Home Assistant when Doshy does not understand | "Ask first" (default) or "Never" (no button at all). |
| Read Assist answers aloud on this device | Off by default; uses the browser's own speech. |

Settings and the chosen agent are saved on this device (`housey-assist` in browser storage).

## Limits and safety

- Sentences are one line, at most 500 characters; control characters become spaces.
- An agent backed by a language model can be slow: the box waits up to 60 seconds and shows "Assist is thinking" with **Cancel**. If you cancel or it times out, Home Assistant may already have done it; check before asking again.
- A conversation is kept for 5 idle minutes, only with the same agent, and the box shows the last 6 turns. Switching agent or home resets it.
- The server allows 20 Assist requests per bucket (refills over time); more gives "Too many Assist requests".
- Blocked while a history **replay** is showing ("Replay mode: controls are off") and on **guest pages** (read-only view). With `DOSHY_GUEST_ONLY=1` both Assist routes answer 403.
- The request must come from the same origin and carry `confirm: true`; a bad agent id or language is refused, not swapped for the default.
- With several homes, the sentence goes to the home that is active when you tap. Changing home cancels a pending request and hides its answer.
- Doshy never logs the sentence, the token or Home Assistant's reply.

Errors you may see: Home Assistant refused the token; Assist or that agent is not set up (404); Home Assistant could not answer; unreadable answer (answers over 128 KiB are refused).

## For contributors

- `lib/assist.ts`: pure rules (limits, `parseAssistRequest`, `parseConversation`, `parseAgents`, `offersAssist`, `conversationFor`, `changedEntities`). Node tests in `lib/assist.test.ts`.
- `lib/server/haAssist.ts`: `processAssist` posts to HA `conversation/process` with a 60 s timeout and a 128 KiB cap; `assistHandler` does same-origin, guest-only, body cap (4096 bytes), token bucket.
- `app/api/ha/assist/route.ts` (POST) uses `haFetchFor(req)` (per-home token) and calls `forgetStates()` after success so the next poll is fresh. `app/api/ha/assist/agents/route.ts` (GET) lists agents over the HA WebSocket (`conversation/agent/list`) plus HA's configured language.
- `components/ui/CommandAssist.tsx` (hand-off, consent, conversation, change toast; calls `assertLive()` first), `AssistSettings.tsx`, `lib/assistStore.ts`, mounted from `CommandBox.tsx` and `DisplayPanel.tsx`.
- Invariants: never send without a deliberate tap; `confirm: true` required server side; `assertLive()` before any write; no logging of text or tokens; stored settings re-checked by `cleanAssistSettings`.

## Not verified

- Behaviour against a real Home Assistant and specific agents (local, cloud, language-model); this was read from the code and fake-HA tests only.
- Whether the token bucket's refill rate suits your use; the capacity (20) is what the code sets.
- Speech output on every browser.
