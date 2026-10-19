const API = "http://localhost:3000";
const $ = (id) => document.getElementById(id);

let token = localStorage.getItem("token");
let me = JSON.parse(localStorage.getItem("user"));
let chatWith = null;
let timer;

async function api(path, method = "GET", body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: body && JSON.stringify(body),
  });

  const data = await res.json();
  if (res.status === 401 && token) logout();
  if (!res.ok) throw new Error(data.error);
  return data;
}

function showLoginForm(yes) {
  $("loginf").classList.toggle("hidden", !yes);
  $("registerf").classList.toggle("hidden", yes);
  $("authMsg").textContent = "";
}
$("regOpen").onclick = () => showLoginForm(false);
$("logOpen").onclick = () => showLoginForm(true);

$("registerBas").onclick = async () => {
  try {
    await api("/register", "POST", {
      username: $("regUsername").value,
      email: $("regEmail").value,
      password: $("regPassword").value,
    });
    showLoginForm(true);
    $("authMsg").textContent = "Registered! Now log in.";
  } catch (err) {
    $("authMsg").textContent = err.message;
  }
};

$("loginBas").onclick = async () => {
  try {
    const data = await api("/login", "POST", {
      email: $("logEmail").value,
      password: $("logPassword").value,
    });
    token = data.token;
    me = data.user;
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(me));
    showApp(true);
  } catch (err) {
    $("authMsg").textContent = err.message;
  }
};

function logout() {
  token = null;
  me = null;
  localStorage.clear();
  $("logPassword").value = "";
  showApp(false);
}
$("logoutBtn").addEventListener("click", logout);

function showApp(loggedIn) {
  $("authSection").classList.toggle("hidden", loggedIn);
  $("chatSection").classList.toggle("hidden", !loggedIn);
  $("navUser").classList.toggle("hidden", !loggedIn);

  chatWith = null;
  $("chatHeader").textContent = "Select a chat";
  $("messages").innerHTML = "";
  $("conversations").innerHTML = "";
  $("sendRow").classList.add("hidden");

  clearInterval(timer);
  if (loggedIn) {
    $("meName").textContent = me.username;
    refresh();
    timer = setInterval(refresh, 3000);
  }
}

function addItem(box, text, onClick) {
  const div = document.createElement("div");
  div.className = "item";
  div.textContent = text;
  div.onclick = onClick;
  box.appendChild(div);
}

function refresh() {
  loadChats();
  if (chatWith) loadMessages();
}

async function loadChats() {
  const users = await api("/conversations");
  if (!token) return;
  $("conversations").innerHTML = "";
  users.forEach((u) =>
    addItem($("conversations"), u.username, () => openChat(u)),
  );
}

$("searchInput").oninput = async () => {
  const q = $("searchInput").value.trim();
  const box = $("searchResults");
  box.innerHTML = "";
  if (!q) return;

  const users = await api("/users/search?q=" + encodeURIComponent(q));
  box.innerHTML = "";
  users.forEach((u) =>
    addItem(box, `${u.username} (${u.email})`, () => {
      openChat(u);
      $("searchInput").value = "";
      box.innerHTML = "";
    }),
  );
};

function openChat(user) {
  chatWith = user;
  $("chatHeader").textContent = user.username;
  $("sendRow").classList.remove("hidden");
  $("messages").innerHTML = "";
  loadMessages();
}

async function loadMessages() {
  const id = chatWith.id;
  const msgs = await api("/messages/" + id);
  if (chatWith?.id !== id) return;

  const box = $("messages");
  box.innerHTML = "";
  msgs.forEach((m) => {
    const mine = m.sender_id === me.id;
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

async function send() {
  const text = $("messageInput").value.trim();
  if (!text) return;
  try {
    await api("/messages", "POST", { receiverId: chatWith.id, text });
    $("messageInput").value = "";
    loadMessages();
  } catch (err) {
    alert(err.message);
  }
}
$("sendBtn").onclick = send;
$("messageInput").onkeydown = (e) => {
  if (e.key === "Enter") send();
};

if (token && me) showApp(true);
