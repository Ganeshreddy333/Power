const bcrypt = require('bcryptjs');
const fs = require('fs');
const mysql = require('mysql2/promise');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const required = ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`${key} must be set`);
    process.exit(1);
  }
}

async function main() {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const socketPath = databaseUrl.searchParams.get('socket');
  if (socketPath) {
    databaseUrl.searchParams.delete('socket');
  }

  const connection = await mysql.createConnection({
    uri: databaseUrl.toString(),
    ...(socketPath ? { socketPath } : {}),
  });
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  const password = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  const firstName = process.env.ADMIN_FIRST_NAME || 'Admin';
  const lastName = process.env.ADMIN_LAST_NAME || 'User';

  await connection.execute(
    `INSERT INTO users (id, email, password, firstName, lastName, role, updatedAt)
     VALUES (UUID(), ?, ?, ?, ?, 'admin', NOW(3))
     ON DUPLICATE KEY UPDATE
       password = VALUES(password),
       firstName = VALUES(firstName),
       lastName = VALUES(lastName),
       role = 'admin',
       updatedAt = NOW(3)`,
    [email, password, firstName, lastName],
  );

  await connection.end();
  console.log(`Admin user ready: ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
