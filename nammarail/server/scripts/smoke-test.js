const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../nammarail.db');

async function checkPort(port, host = 'localhost') {
  return new Promise((resolve) => {
    const req = http.request({ method: 'GET', host, port, path: '/' }, (res) => {
      resolve(true);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.end();
  });
}

async function pingEngine() {
  return new Promise((resolve) => {
    // using fetch instead
    fetch('http://localhost:18080/ping')
      .then(res => resolve(res.ok))
      .catch(() => resolve(false));
  });
}

async function pingNode() {
  return new Promise((resolve) => {
    fetch('http://localhost:5000/api/stations/search?q=chennai')
      .then(res => resolve(res.ok))
      .catch(() => resolve(false));
  });
}

async function run() {
  console.log('--- NammaRail Smoke Test ---');
  let passed = true;

  // 1. Check Database
  try {
    const db = new Database(DB_PATH, { fileMustExist: true });
    const row = db.prepare('SELECT count(*) as count FROM trains').get();
    console.log(`✅ Database connected (Trains: ${row.count})`);
    db.close();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    passed = false;
  }

  // 2. Check Node Server
  const nodeAlive = await pingNode();
  if (nodeAlive) {
    console.log('✅ Node.js API is alive (Port 5000)');
  } else {
    console.error('❌ Node.js API is unreachable. Is it running?');
    passed = false;
  }

  // 3. Check C++ Engine
  const engineAlive = await pingEngine();
  if (engineAlive) {
    console.log('✅ C++ Tatkal Engine is alive (Port 18080)');
  } else {
    console.error('❌ C++ Tatkal Engine is unreachable. Is it running?');
    passed = false;
  }

  if (passed) {
    console.log('\nAll systems GO 🚀');
    process.exit(0);
  } else {
    console.log('\nSmoke test FAILED 💥');
    process.exit(1);
  }
}

run();
