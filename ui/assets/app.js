const API = "/api/v1";
let currentWorkspace = null;
let currentConversation = null;

// dom refs
const workspaceList = document.getElementById("workspace-list");
const conversationList = document.getElementById("conversation-list");
const welcomeView = document.getElementById("welcome");
const chatView = document.getElementById("chat-view");
const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const fileUpload = document.getElementById("file-upload");
const scrapeBtn = document.getElementById("scrape-btn");
const newWorkspaceBtn = document.getElementById("new-workspace");
const walletBadge = document.getElementById("wallet-badge");
const walletAddress = document.getElementById("wallet-address");
const sourcesBar = document.getElementById("sources-bar");
const sourcesList = document.getElementById("sources-list");

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  return res.json();
}

// workspaces
async function loadWorkspaces() {
  const { workspaces } = await api("/workspaces");
  workspaceList.innerHTML = "";
  for (const ws of workspaces || []) {
    const li = document.createElement("li");
    li.textContent = ws.name;
    li.dataset.id = ws.id;
    if (currentWorkspace?.id === ws.id) li.classList.add("active");
    li.onclick = () => selectWorkspace(ws);
    workspaceList.appendChild(li);
  }
}

async function selectWorkspace(ws) {
  currentWorkspace = ws;
  currentConversation = null;
  welcomeView.classList.add("hidden");
  chatView.classList.remove("hidden");
  messagesEl.innerHTML = "";
  sourcesBar.classList.add("hidden");

  loadWorkspaces();
  loadConversations(ws.id);
}

async function loadConversations(workspaceId) {
  const { conversations } = await api(`/chat/conversations/${workspaceId}`);
  conversationList.innerHTML = "";
  for (const conv of conversations || []) {
    const li = document.createElement("li");
    li.textContent = conv.title;
    li.dataset.id = conv.id;
    if (currentConversation?.id === conv.id) li.classList.add("active");
    li.onclick = () => selectConversation(conv);
    conversationList.appendChild(li);
  }
}

async function selectConversation(conv) {
  currentConversation = conv;
  const { messages } = await api(`/chat/messages/${conv.id}`);
  messagesEl.innerHTML = "";
  for (const msg of messages || []) {
    appendMessage(msg.role, msg.content);
  }
  loadConversations(currentWorkspace.id);
  scrollToBottom();
}

// chat
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message || !currentWorkspace) return;

  chatInput.value = "";
  appendMessage("user", message);
  scrollToBottom();

  try {
    const data = await api(`/chat/${currentWorkspace.id}`, {
      method: "POST",
      body: JSON.stringify({
        message,
        conversationId: currentConversation?.id,
      }),
    });

    if (data.error) {
      appendMessage("assistant", `Error: ${data.error}`);
    } else {
      currentConversation = { id: data.conversationId };
      appendMessage("assistant", data.message.content);

      if (data.sources?.length) {
        sourcesBar.classList.remove("hidden");
        sourcesList.innerHTML = "";
        for (const src of data.sources) {
          const chip = document.createElement("span");
          chip.className = "source-chip";
          chip.textContent = src.metadata?.filename || src.content.slice(0, 40);
          sourcesList.appendChild(chip);
        }
      }

      loadConversations(currentWorkspace.id);
    }
  } catch (err) {
    appendMessage("assistant", "Something went wrong. Check the server logs.");
  }

  scrollToBottom();
});

function appendMessage(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "role-label";
  label.textContent = role === "user" ? "You" : "Xio";
  div.appendChild(label);

  const body = document.createElement("div");
  body.innerHTML = formatContent(content);
  div.appendChild(body);

  messagesEl.appendChild(div);
}

function formatContent(text) {
  // basic markdown: code blocks, bold, links
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// file upload
fileUpload.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file || !currentWorkspace) return;

  const formData = new FormData();
  formData.append("file", file);

  appendMessage("user", `Uploading ${file.name}...`);

  try {
    const res = await fetch(
      `${API}/documents/upload/${currentWorkspace.id}`,
      { method: "POST", body: formData }
    );
    const data = await res.json();
    appendMessage(
      "assistant",
      `File "${data.document?.filename}" uploaded and is being processed. You can start asking questions about it.`
    );
  } catch (err) {
    appendMessage("assistant", "Upload failed. Check the server logs.");
  }

  fileUpload.value = "";
  scrollToBottom();
});

// scrape
scrapeBtn.addEventListener("click", async () => {
  if (!currentWorkspace) return;
  const url = prompt("Enter URL to scrape:");
  if (!url) return;

  appendMessage("user", `Scraping ${url}...`);

  try {
    const data = await api(`/documents/scrape/${currentWorkspace.id}`, {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    appendMessage(
      "assistant",
      `Scraped "${url}" successfully (${data.document?.chunks || 0} chunks). You can ask questions about it now.`
    );
  } catch (err) {
    appendMessage("assistant", "Scrape failed.");
  }

  scrollToBottom();
});

// new workspace
newWorkspaceBtn.addEventListener("click", async () => {
  const name = prompt("Workspace name:");
  if (!name) return;

  const data = await api("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  if (data.workspace) {
    await loadWorkspaces();
    selectWorkspace(data.workspace);
  }
});

// wallet
async function loadWallet() {
  try {
    const data = await api("/wallet/info");
    if (data.address) {
      walletBadge.classList.remove("hidden");
      walletAddress.textContent =
        data.address.slice(0, 4) + "..." + data.address.slice(-4);
    }
  } catch {
    // no wallet configured
  }
}

// init
loadWorkspaces();
loadWallet();
