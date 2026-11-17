const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.redirect("/index.html");
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

app.post("/api/chat", async (req,res) => {
    try {
        const message = req.body.message;

        if (!message || !Array.isArray(message)) {
            return res.status(400).json({
                error: "Messages harus berupa Array"
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "GEMINI_API_KEY belum disetel di file .env" });
        }

        // Terima format chat OpenAI (role/content) dan ubah ke format Gemini.
        const contents = message.map((item) => {
            const role = item.role === "assistant" || item.role === "model" ? "model" : "user";
            const text = typeof item.content === "string"
                ? item.content
                : Array.isArray(item.parts)
                    ? item.parts.map((part) => part.text || "").join("")
                    : "";
            return { role, parts: [{ text }] };
        }).filter((item) => item.parts[0].text);

        if (!contents.length) {
            return res.status(400).json({ error: "Messages tidak berisi teks" });
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1000
                    }
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.text();
            console.error("Gemini API Error:", errorData);
            return res.status(response.status).json({error: errorData});
        }

        // Header untuk Streaming
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, {
                stream: true
            });

            const lines = buffer.split("\n");

            buffer = lines.pop();

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (!trimmedLine) {
                    continue;
                }
                if (!trimmedLine.startsWith("data")) {
                    continue;
                }
                if (!trimmedLine.startsWith("data:")) {
                    continue;
                }

                const data = trimmedLine.slice(5).trim();

                if (data === "[DONE]") {
                    continue;
                }

                try {
                    const json = JSON.parse(data);
                    const content = json.candidates?.[0]?.content?.parts
                        ?.map((part) => part.text || "")
                        .join("");
                    if (content) {
                        res.write(`data: ${JSON.stringify(content)}\n\n`);
                    }
                } catch (error) {
                    console.error("Gagal parsing streaming data:", error);
                }
            }
        }
        res.write("data: [DONE]\n\n");
        res.end();

    } catch (error) {
        console.error("Server Error:", error);
        if (!res.headerSent) {
            res.status(500).json({error: "Terjadi kesalahan pada server"});
        } else {
            res.write(`data: ${JSON.stringify("Terjadi kesalahan pada server")}\n\n`);
            res.end();
        }
    }
});
