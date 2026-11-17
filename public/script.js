const form = document.querySelector("#chat-form");
const promptInput = document.querySelector("#prompt");
const messagesElement = document.querySelector("#messages");
const sendButton = document.querySelector("#send-button");
const history = [];

function addMessage(role, text = "") {
  document.querySelector("#welcome")?.remove();
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "Kamu" : "Gemini";
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;
  article.append(label, body);
  messagesElement.append(article);
  messagesElement.scrollTop = messagesElement.scrollHeight;
  return body;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = promptInput.value.trim();
  if (!message || sendButton.disabled) return;

  promptInput.value = "";
  promptInput.style.height = "auto";
  history.push({ role: "user", content: message });
  addMessage("user", message);
  const responseBody = addMessage("assistant", "");
  sendButton.disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: history })
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
      const events = buffer.split("\n\n");
      buffer = events.pop();

      for (const eventText of events) {
        const line = eventText.split("\n").find((entry) => entry.startsWith("data: "));
        if (!line) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          answer += JSON.parse(data);
          responseBody.textContent = answer;
          messagesElement.scrollTop = messagesElement.scrollHeight;
        } catch {
          // Abaikan potongan event yang bukan JSON.
        }
      }
    }
    if (!answer) responseBody.textContent = "Gemini tidak mengirim jawaban.";
    else history.push({ role: "assistant", content: answer });
  } catch (error) {
    responseBody.textContent = `Error: ${error.message}`;
  } finally {
    sendButton.disabled = false;
    promptInput.focus();
  }
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 160)}px`;
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelector("#clear-chat").addEventListener("click", () => {
  history.length = 0;
  messagesElement.innerHTML = '<div class="welcome" id="welcome"><div class="welcome-icon">✦</div><h2>Mau ngobrol apa hari ini?</h2><p>Tulis pertanyaan atau ide kamu di bawah.</p></div>';
  promptInput.focus();
});
