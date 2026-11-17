const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const messages = [];
let waiting = false;

function addMessage(role, text, isError = false) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = isError ? "bubble error" : "bubble";
  bubble.textContent = text;
  message.append(bubble);
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || waiting) return;

  messages.push({ role: "user", content: text });
  addMessage("user", text);
  messageInput.value = "";
  waiting = true;
  sendButton.disabled = true;
  messageInput.disabled = true;
  const reply = addMessage("bot", "");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messages })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Request gagal (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          answer += JSON.parse(data);
          reply.textContent = answer;
          chatLog.scrollTop = chatLog.scrollHeight;
        } catch { /* Ignore incomplete SSE chunks. */ }
      }
    }
    if (!answer) throw new Error("Gemini tidak mengirim jawaban.");
    messages.push({ role: "assistant", content: answer });
  } catch (error) {
    reply.textContent = `Maaf, ${error.message}`;
    reply.classList.add("error");
    messages.pop();
  } finally {
    waiting = false;
    sendButton.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
  }
});
