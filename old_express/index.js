const express = require("express")
const { createGroq } = require("@ai-sdk/groq")
const { experimental_transcribe: transcribe } = require("ai")
const { stepCountIs, streamText,tool } = require("ai")
const cors = require("cors")
const {z} = require("zod")

const app = express()
const PORT = 3000;
const TTS_SERVER = "http://127.0.0.1:8000"

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY  })
const sttModel = groq.transcription("whisper-large-v3-turbo")
const llm = groq("openai/gpt-oss-120b") 

const MESSAGES = {};

app.use(cors())
app.use(express.json({ limit: "50mb" }))


// ── Transcribe audio ──────────────────────────────────────────────────────────

app.post("/transcribe", async (req, res) => {
    try {
        const { base64Audio } = req.body;

        if (!base64Audio) {
            return res.status(400).json({ error: "base64Audio is required" });
        }

        const result = await transcribe({
            model: sttModel,
            audio: base64Audio,
            providerOptions: {
                groq: { language: "en" },
            },
        });

        return res.status(200).json({ transcription: result.text });

    } catch (error) {
        console.error("Transcription Error:", error);
        return res.status(500).json({
            error: "Failed to transcribe audio",
            message: error.message
        });
    }
});


// ── Initialize chat session ───────────────────────────────────────────────────

app.get("/initializeChat", (req, res) => {  // fix: was "intializeChat", missing leading /
    const id = Date.now().toString()
    MESSAGES[id] = [];
    return res.json({ id })
})


// ── Get AI response as streamed audio ─────────────────────────────────────────

app.post("/getAIAudio", async (req, res) => {
    const { chatId, prompt } = req.body;

    if (!chatId || !MESSAGES[chatId]) {
        return res.status(400).json({ error: "Invalid or missing chatId. Call /initializeChat first." })
    }

    if (!prompt) {
        return res.status(400).json({ error: "prompt is required" })
    }

    try {
        MESSAGES[chatId].push({ role: "user", content: prompt })

        const result = await streamText({
            model: llm,
            stopWhen: stepCountIs(5),
            tools: {
    weather: tool({
      description: 'Get the weather in a location',
      inputSchema: z.object({
        location: z.string().describe('The location to get the weather for'),
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72 + Math.floor(Math.random() * 21) - 10,
      }),
    }),
  },
            system: `You are a voice assistant. Keep responses to 1-3 short sentences max.
- No bullet points, headers, or markdown
- No filler phrases like "Certainly!" or "Great question!"
- If unsure, say so briefly and offer to help another way
- Speak like a human — natural, direct, warm`,
            messages: MESSAGES[chatId], // fix: was MESSAGES[id]
        })

        // Collect the full LLM text response
        let fullText = ""
        for await (const textPart of result.textStream) {
            fullText += textPart
        }

        MESSAGES[chatId].push({ role: "assistant", content: fullText })

        const ttsRes = await fetch(
            `${TTS_SERVER}/tts?text=${encodeURIComponent(fullText)}&lang=en&voice=M1&speed=1.0`
        )

        if (!ttsRes.ok) {
            const err = await ttsRes.text()
            throw new Error(`TTS server error: ${err}`)
        }

        res.setHeader("Content-Type", "audio/wav")
        res.setHeader("X-Transcript", encodeURIComponent(fullText)) 
        res.setHeader("Access-Control-Expose-Headers", "X-Transcript")

        const reader = ttsRes.body.getReader()
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
        }
        res.end()

    } catch (error) {
        console.error("getAIAudio Error:", error)

        if (!res.headersSent) {
            return res.status(500).json({
                error: "Failed to generate audio response",
                message: error.message
            })
        }
    }
})


app.get("/history/:chatId", (req, res) => {
    const { chatId } = req.params
    if (!MESSAGES[chatId]) {
        return res.status(404).json({ error: "Chat session not found" })
    }
    return res.json({ messages: MESSAGES[chatId] })
})



app.delete("/session/:chatId", (req, res) => {
    const { chatId } = req.params
    delete MESSAGES[chatId]
    return res.json({ success: true })
})


// ── Initialize Interview session ──────────────────────────────────────────────
app.post("/initializeInterview", (req, res) => {
    const { jd, resume } = req.body;

    if (!jd || !resume) {
        return res.status(400).json({ error: "Both Job Description (jd) and Resume (resume) are required." });
    }

    const id = "intv_" + Date.now().toString();
    
    const systemPrompt = `You are a professional AI interviewer conducting a technical and behavioral screening for a candidate.

Job Description (JD):
${jd}

Candidate Resume:
${resume}

Instructions:
- Keep the interview highly realistic, professional, and friendly.
- Ask ONE targeted question at a time.
- Start by welcoming the candidate and asking them a general icebreaker or an intro question about their background.
- Keep your questions and responses extremely short and conversational (1-2 sentences max).
- Speak naturally. Do not use bullet points, markdown, or lists.`;

    const firstQuestion = "Hello! Thank you for joining the interview today. To start, could you please introduce yourself and share a brief overview of your background?";

    MESSAGES[id] = [
        { role: "system", content: systemPrompt },
        { role: "assistant", content: firstQuestion }
    ];

    return res.json({ id, firstQuestion });
});

// ── Stream Interview Intro Audio ──────────────────────────────────────────────
app.get("/getInterviewIntroAudio/:chatId", async (req, res) => {
    const { chatId } = req.params;

    if (!chatId || !MESSAGES[chatId]) {
        return res.status(404).json({ error: "Interview session not found" });
    }

    const firstQuestion = MESSAGES[chatId].find(m => m.role === "assistant")?.content || "";

    try {
        const ttsRes = await fetch(
            `${TTS_SERVER}/tts?text=${encodeURIComponent(firstQuestion)}&lang=en&voice=M1&speed=1.0`
        );

        if (!ttsRes.ok) {
            const err = await ttsRes.text();
            throw new Error(`TTS server error: ${err}`);
        }

        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("X-Transcript", encodeURIComponent(firstQuestion));
        res.setHeader("Access-Control-Expose-Headers", "X-Transcript");

        const reader = ttsRes.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();

    } catch (error) {
        console.error("getInterviewIntroAudio Error:", error);
        if (!res.headersSent) {
            return res.status(500).json({ error: "Failed to generate audio response", message: error.message });
        }
    }
});

// ── Stream dynamic Interview Audio Q&A ─────────────────────────────────────────
app.post("/getInterviewAudio", async (req, res) => {
    const { chatId, prompt } = req.body;

    if (!chatId || !MESSAGES[chatId]) {
        return res.status(400).json({ error: "Invalid or missing chatId. Call /initializeInterview first." });
    }

    if (!prompt) {
        return res.status(400).json({ error: "prompt is required" });
    }

    try {
        MESSAGES[chatId].push({ role: "user", content: prompt });

        const result = await streamText({
            model: llm,
            stopWhen: stepCountIs(5),
            messages: MESSAGES[chatId],
        });

        // Collect the full LLM text response
        let fullText = "";
        for await (const textPart of result.textStream) {
            fullText += textPart;
        }

        MESSAGES[chatId].push({ role: "assistant", content: fullText });

        const ttsRes = await fetch(
            `${TTS_SERVER}/tts?text=${encodeURIComponent(fullText)}&lang=en&voice=M1&speed=1.0`
        );

        if (!ttsRes.ok) {
            const err = await ttsRes.text();
            throw new Error(`TTS server error: ${err}`);
        }

        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("X-Transcript", encodeURIComponent(fullText));
        res.setHeader("Access-Control-Expose-Headers", "X-Transcript");

        const reader = ttsRes.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();

    } catch (error) {
        console.error("getInterviewAudio Error:", error);

        if (!res.headersSent) {
            return res.status(500).json({
                error: "Failed to generate interview audio response",
                message: error.message
            });
        }
    }
});


app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`)
});