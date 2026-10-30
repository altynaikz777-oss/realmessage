const API = "http://localhost:3000";

interface User {
  id: number;
  username: string;
  email?: string;
}

interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  text: string;
}

interface LoginResponse {
  token: string;
  user: User;
}

type HttpMethod = "GET" | "POST" | "DELETE";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}


function input(id: string): HTMLInputElement {
  const el = $(id);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Element #${id} is not an input`);
  }
  return el;
}

const storedUser = localStorage.getItem("user");

let token: string | null = localStorage.getItem("token");
let me: User | null = storedUser ? JSON.parse(storedUser) : null;
let chatWith: User | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

async function api<T = unknown>(
  path: string,
  method: HttpMethod = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await res.json();
  if (res.status === 401 && token) logout();
  if (!res.ok) throw new Error(data.error);
  return data;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function showLoginForm(yes: boolean): void {
  $("loginf").classList.toggle("hidden", !yes);
  $("registerf").classList.toggle("hidden", yes);
  $("authMsg").textContent = "";
}
$("regOpen").onclick = () => showLoginForm(false);
$("logOpen").onclick = () => showLoginForm(true);

$("registerBas").onclick = async () => {
  try {
    await api("/register", "POST", {
      username: input("regUsername").value,
      email: input("regEmail").value,
      password: input("regPassword").value,
    });
    showLoginForm(true);
    $("authMsg").textContent = "Registered! Now log in.";
  } catch (err) {
    $("authMsg").textContent = errorMessage(err);
  }
};

$("loginBas").onclick = async () => {
  try {
    const data = await api<LoginResponse>("/login", "POST", {
      email: input("logEmail").value,
      password: input("logPassword").value,
    });
    token = data.token;
    me = data.user;
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(me));
    showApp(true);
  } catch (err) {
    $("authMsg").textContent = errorMessage(err);
  }
};

function logout(): void {
  token = null;
  me = null;
  localStorage.clear();
  input("logPassword").value = "";
  showApp(false);
}
$("logoutBtn").addEventListener("click", logout);

function showApp(loggedIn: boolean): void {
  $("authSection").classList.toggle("hidden", loggedIn);
  $("chatSection").classList.toggle("hidden", !loggedIn);
  $("navUser").classList.toggle("hidden", !loggedIn);

  chatWith = null;
  $("chatHeader").textContent = "Select a chat";
  $("messages").innerHTML = "";
  $("conversations").innerHTML = "";
  $("sendRow").classList.add("hidden");

  clearInterval(timer);
  if (loggedIn && me) {
    $("meName").textContent = me.username;
    refresh();
    timer = setInterval(refresh, 3000);
  }
}

function addItem(box: HTMLElement, text: string, onClick: () => void): void {
  const div = document.createElement("div");
  div.className = "item";
  div.textContent = text;
  div.onclick = onClick;
  box.appendChild(div);
}

function refresh(): void {
  loadChats();
  if (chatWith) loadMessages();
}

async function loadChats(): Promise<void> {
  const users = await api<User[]>("/conversations");
  if (!token) return;
  $("conversations").innerHTML = "";
  users.forEach((u) =>
    addItem($("conversations"), u.username, () => openChat(u)),
  );
}

input("searchInput").oninput = async () => {
  const searchInput = input("searchInput");
  const q = searchInput.value.trim();
  const box = $("searchResults");
  box.innerHTML = "";
  if (!q) return;

  const users = await api<User[]>("/users/search?q=" + encodeURIComponent(q));
  box.innerHTML = "";
  users.forEach((u) =>
    addItem(box, `${u.username} (${u.email})`, () => {
      openChat(u);
      searchInput.value = "";
      box.innerHTML = "";
    }),
  );
};

function openChat(user: User): void {
  chatWith = user;
  $("chatHeader").textContent = user.username;
  $("sendRow").classList.remove("hidden");
  $("messages").innerHTML = "";
  loadMessages();
}

async function loadMessages(): Promise<void> {
  if (!chatWith || !me) return;

  const id = chatWith.id;
  const myId = me.id;
  const msgs = await api<Message[]>("/messages/" + id);
  if (chatWith?.id !== id) return;

  const box = $("messages");
  box.innerHTML = "";
  msgs.forEach((m) => {
    const mine = m.sender_id === myId;
    const div = document.createElement("div");
    div.className = mine ? "bubble mine" : "bubble";
    div.textContent = m.text;

    if (mine) {
      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "Delete";
      del.onclick = async () => {
        await api("/messages/" + m.id, "DELETE");
        loadMessages();
      };
      div.appendChild(del);
    }
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

async function send(): Promise<void> {
  if (!chatWith) return;

  const messageInput = input("messageInput");
  const text = messageInput.value.trim();
  if (!text) return;
  try {
    await api("/messages", "POST", { receiverId: chatWith.id, text });
    messageInput.value = "";
    loadMessages();
  } catch (err) {
    alert(errorMessage(err));
  }
}
$("sendBtn").onclick = send;
$("messageInput").onkeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") send();
};

if (token && me) showApp(true);
