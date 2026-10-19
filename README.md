# Messenger

Node.js, Express, PostgreSQL, JWT, vanilla JavaScript.

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in
3. `psql -d myfirstdb -f schema.sql`
4. `npm run dev`
5. Open `index.html` with Live Server

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /register | no | create account |
| POST | /login | no | get token |
| GET | /users/search?q= | yes | find users |
| GET | /conversations | yes | people I chatted with |
| GET | /messages/:userId | yes | conversation with a user |
| POST | /messages | yes | send message |
| DELETE | /messages/:id | yes | delete my message |
