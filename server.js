import "dotenv/config";
import express from "express";
import { Pool } from "pg";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import validator from "validator";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20kb" }));

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: "localhost",
  port: 5432,
});

function normalizeId(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Not logged in",
      });
    }

    const token = header.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        error: "Not logged in",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = normalizeId(decoded.id);

    if (userId === null) {
      return res.status(401).json({
        error: "Invalid token",
      });
    }

    req.userId = userId;
    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
}

app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: "Fill in all fields",
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        error: "Password must be between 8 and 72 characters",
      });
    }

    if (!validator.isEmail(cleanEmail)) {
      return res.status(400).json({
        error: "Enter a valid email address",
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, username`,
      [cleanUsername, cleanEmail, hash],
    );

    return res.status(201).json({
      message: "Registered successfully",
      user: result.rows[0],
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "Username or email already taken",
      });
    }

    console.error("Registration error:", err);

    return res.status(500).json({
      error: "Registration failed",
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: "Enter your email and password",
      });
    }

    const result = await pool.query(
      `SELECT id, username, email, password
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()],
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: "Wrong email or password",
      });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "12h",
    });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      error: "Login failed",
    });
  }
});

app.get("/users/search", auth, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!q) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT id, username, email
       FROM users
       WHERE (username ILIKE $1 OR email ILIKE $1)
         AND id != $2
       ORDER BY username
       LIMIT 10`,
      [`%${q}%`, req.userId],
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("User search error:", err);

    return res.status(500).json({
      error: "Failed to search users",
    });
  }
});

app.get("/conversations", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.username
       FROM users u
       JOIN messages m
         ON (
           (m.sender_id = u.id AND m.receiver_id = $1)
           OR
           (m.receiver_id = u.id AND m.sender_id = $1)
         )
       WHERE u.id != $1
       ORDER BY u.username`,
      [req.userId],
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("Load conversations error:", err);

    return res.status(500).json({
      error: "Failed to load conversations",
    });
  }
});

app.get("/messages/:userId", auth, async (req, res) => {
  try {
    const otherUserId = normalizeId(req.params.userId);

    if (otherUserId === null) {
      return res.status(400).json({
        error: "Invalid user ID",
      });
    }

    if (otherUserId === req.userId) {
      return res.json([]);
    }

    const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [
      otherUserId,
    ]);

    if (userResult.rowCount === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const result = await pool.query(
      `SELECT id, sender_id, receiver_id, text
       FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2)
          OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY id ASC`,
      [req.userId, otherUserId],
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("Load messages error:", err);

    return res.status(500).json({
      error: "Failed to load messages",
    });
  }
});

app.post("/messages", auth, async (req, res) => {
  try {
    const { receiverId, text } = req.body;

    const recipientId = normalizeId(receiverId);
    const messageText = typeof text === "string" ? text.trim() : "";

    if (recipientId === null || !messageText) {
      return res.status(400).json({
        error: "Enter a valid recipient and message",
      });
    }

    if (recipientId === req.userId) {
      return res.status(400).json({
        error: "You cannot send a message to yourself",
      });
    }

    if (messageText.length > 5000) {
      return res.status(400).json({
        error: "Message cannot exceed 5000 characters",
      });
    }

    const recipient = await pool.query("SELECT id FROM users WHERE id = $1", [
      recipientId,
    ]);

    if (recipient.rowCount === 0) {
      return res.status(404).json({
        error: "Recipient not found",
      });
    }

    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, text)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, receiver_id, text`,
      [req.userId, recipientId, messageText],
    );

    return res.status(201).json({
      message: "Sent successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Send message error:", err);

    return res.status(500).json({
      error: "Failed to send message",
    });
  }
});

app.delete("/messages/:id", auth, async (req, res) => {
  try {
    const messageId = normalizeId(req.params.id);

    if (messageId === null) {
      return res.status(400).json({
        error: "Invalid message ID",
      });
    }

    const result = await pool.query(
      `DELETE FROM messages
       WHERE id = $1 AND sender_id = $2
       RETURNING id`,
      [messageId, req.userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Message not found or you cannot delete it",
      });
    }

    return res.json({
      message: "Deleted successfully",
    });
  } catch (err) {
    console.error("Delete message error:", err);

    return res.status(500).json({
      error: "Failed to delete message",
    });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error("Unexpected server error:", err);

  return res.status(500).json({
    error: "Internal server error",
  });
});

async function startServer() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from your .env file");
  }

  await pool.query("SELECT 1");

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Could not start server:", err);
  process.exit(1);
});
